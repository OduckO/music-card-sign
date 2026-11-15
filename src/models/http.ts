import type { HttpOptions, HttpRequest, HttpSigner } from '@/types'
import type { ErrorRequestHandler, RequestHandler } from 'express'
import { errorMessage, errorStatus } from '@/utils'

import http from 'node:http'
import { cardText, MusicSignError } from './music-sign'

type HostHandler = RequestHandler | ErrorRequestHandler | http.RequestListener

interface RouterLayer {
  handle: HostHandler
  route?: unknown
  name?: string
  slash?: boolean
  regexp?: RegExp & { fast_slash?: boolean }
}

export interface ExpressHost {
  use: (path: string, handler: HostHandler) => unknown
  _router?: { stack: RouterLayer[] }
  router?: { stack: RouterLayer[] }
  quiet?: string[]
}

const signPaths = new Set(['/', '/music_card/card', '/api/music/sign', '/sign'])
const healthPaths = new Set(['/health', '/healthz'])
const bodyLimit = 64 * 1024

function respond(res: http.ServerResponse, status: number, data: unknown) {
  if (res.destroyed || res.writableEnded) return
  const body = typeof data === 'string' ? data : JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  })
  res.end(body)
}

async function readBody(req: HttpRequest): Promise<unknown> {
  if (req.body !== undefined) {
    if (Buffer.byteLength(JSON.stringify(req.body)) > bodyLimit)
      throw new MusicSignError('请求体过大', 413)
    return req.body
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size <= bodyLimit) chunks.push(chunk)
  }
  if (size > bodyLimit) throw new MusicSignError('请求体过大', 413)
  const raw = Buffer.concat(chunks)
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .trim()
  if (!raw) return {}
  if (String(req.headers['content-type']).includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw))
  }
  try {
    return JSON.parse(raw)
  } catch {
    throw new MusicSignError('请求体不是有效 JSON')
  }
}

export function createHandler(
  signer: HttpSigner,
  {
    apiKey = '',
    mounted = false,
    path: configuredPath = '/music_card/card',
    onLog
  }: HttpOptions = {}
) {
  let sequence = 0
  return async (req: HttpRequest, res: http.ServerResponse) => {
    const started = performance.now()
    const trace = `请求=${++sequence}`
    const send = (status: number, data: unknown) => {
      respond(res, status, data)
      onLog?.(
        status < 400 ? 'info' : 'warn',
        `${trace} 响应 ${status}，${Math.round(performance.now() - started)} ms`
      )
    }
    try {
      const url = new URL(req.url || '/', 'http://localhost')
      const path = url.pathname.replace(/\/+$/, '') || '/'
      onLog?.(
        'info',
        `${trace} 收到 ${req.method} ${mounted ? configuredPath : ''}${path === '/' && mounted ? '' : path}`
      )
      if (healthPaths.has(path) && req.method === 'GET') {
        return send(200, { service: 'icqq-music-card-sign', ...signer.status?.() })
      }
      if (!(mounted ? path === '/' : path === configuredPath || signPaths.has(path))) {
        return send(404, { error: 'not found' })
      }
      if (
        apiKey &&
        req.headers.authorization !== `Bearer ${apiKey}` &&
        req.headers['x-api-key'] !== apiKey
      ) {
        return send(401, { error: 'API 鉴权失败' })
      }
      if (req.method === 'GET' && !url.search) {
        return send(200, { service: 'icqq-music-card-sign', ...signer.status?.() })
      }
      if (!['GET', 'POST'].includes(req.method || ''))
        return send(405, { error: '使用 POST 或 GET' })
      const body = await readBody(req)
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new MusicSignError('请求体必须是 JSON 对象')
      }
      const input = { ...Object.fromEntries(url.searchParams), ...body }
      onLog?.('info', `${trace} 请求解析完成，开始签名`)
      const card = await signer.sign(input)
      send(200, cardText(card))
    } catch (error) {
      onLog?.('error', `${trace} 请求失败：${errorMessage(error)}`)
      send(errorStatus(error), { error: errorMessage(error) })
    }
  }
}

export async function mountService(
  app: ExpressHost,
  signer: HttpSigner,
  options: HttpOptions = {}
) {
  const path = options.path || '/music_card/card'
  if (!/^\/[\w/-]+$/.test(path) || path.endsWith('/'))
    throw new Error('签名 path 必须是不带结尾斜线的绝对路径')
  const handler = createHandler(signer, { ...options, mounted: true })
  const ingress: RequestHandler = function musicCardIngress(req, res, next) {
    options.onLog?.('info', `宿主入口收到 ${req.method} ${path}${req.path === '/' ? '' : req.path}`)
    const hostError = (status: number, body?: unknown) => {
      const message =
        status === 401 || status === 403
          ? '云崽宿主鉴权未通过，请按云崽 HTTP 配置提供请求头'
          : typeof body === 'string'
            ? body
            : http.STATUS_CODES[status] || 'HTTP error'
      options.onLog?.('warn', `${message}，响应 ${status}`)
      respond(res, status, { error: message })
      return res
    }
    // 宿主会用 redirect、sendStatus 或 status().send() 返回错误；只修改音卡请求的格式。
    const send = res.send.bind(res)
    res.send = (body) => (res.statusCode >= 400 ? hostError(res.statusCode, body) : send(body))
    res.redirect = () => hostError(401)
    next()
  }
  const handleError: ErrorRequestHandler = function musicCardHttpError(error, _req, res, _next) {
    options.onLog?.('error', `宿主请求解析失败：${errorMessage(error)}`)
    respond(res, errorStatus(error), { error: errorMessage(error) })
  }
  const removeRoutes = () => {
    const stack = app._router?.stack ?? app.router?.stack
    if (!stack) return
    for (const ownHandler of [ingress, handler, handleError]) {
      const index = stack.findIndex((layer) => layer.handle === ownHandler)
      if (index !== -1) stack.splice(index, 1)
    }
  }
  const local = options.localPort ? http.createServer(createHandler(signer, options)) : null
  if (local) {
    await new Promise<void>((resolve, reject) => {
      local.once('error', reject)
      local.listen(options.localPort, '127.0.0.1', () => {
        local.removeListener('error', reject)
        resolve()
      })
    })
    local.unref()
  }
  try {
    app.use(path, ingress)
    app.use(path, handler)
    app.use(path, handleError)
  } catch (error) {
    removeRoutes()
    local?.close()
    throw error
  }
  const stack = app._router?.stack ?? app.router?.stack
  if (stack) {
    const ingressIndex = stack.findIndex((layer) => layer.handle === ingress)
    if (ingressIndex > 0) stack.unshift(stack.splice(ingressIndex, 1)[0])
    // 热加载时，路由和错误处理都须位于云崽的全局重定向及错误处理之前。
    for (const ownHandler of [handler, handleError]) {
      const routeIndex = stack.findIndex((layer) => layer.handle === ownHandler)
      const fallbackIndex = stack.findIndex(
        (layer) =>
          !layer.route &&
          layer.name === '<anonymous>' &&
          (layer.slash || layer.regexp?.fast_slash) &&
          layer.handle.length < 3
      )
      if (fallbackIndex !== -1 && routeIndex > fallbackIndex) {
        stack.splice(fallbackIndex, 0, stack.splice(routeIndex, 1)[0])
      }
    }
  }
  const quietAdded = Array.isArray(app.quiet) && !app.quiet.includes(path)
  if (quietAdded) app.quiet!.push(path)
  return async () => {
    removeRoutes()
    if (quietAdded) {
      const index = app.quiet!.indexOf(path)
      if (index !== -1) app.quiet!.splice(index, 1)
    }
    if (local) {
      local.closeAllConnections?.()
      await new Promise<void>((resolve) => local.close(() => resolve()))
    }
  }
}
