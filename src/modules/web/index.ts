import type { RequestHandler } from 'express'
import config from '@/config'
import type { HttpRequest, MusicRequest } from '@/types'
import { readBody } from '@/models/http'
import { MusicSignError, platforms } from '@/models/music-sign'
import { getServiceStatus, signCard, updateSettings } from '@/modules/music-card-sign/service'
import { configPatch } from '@/modules/music-card-sign/settings'
import { errorMessage, errorStatus } from '@/utils'

export interface PageContext {
  basePath?: string
  registerPage: (descriptor: {
    id: string
    title: string
    icon: string
    src: string
    style: string
    script: string
    priority: number
  }) => unknown
  registerApi: (method: 'get' | 'post', route: string, handler: RequestHandler) => unknown
}

const objectBody = (body: unknown): Record<string, unknown> => {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new MusicSignError('请求体必须是 JSON 对象')
  return body as Record<string, unknown>
}

export function init(ctx: PageContext) {
  const prefix = ctx.basePath === undefined ? '' : '/music-card-sign'
  for (const [id, title, icon, src, priority] of [
    ['music-card-settings', '音卡设置', '⚙️', 'settings.html', 70],
    ['music-card-request', '请求音卡', '🎵', 'sign.html', 71]
  ] as const) {
    ctx.registerPage({ id, title, icon, src, style: 'app.css', script: 'app.js', priority })
  }

  const register = (
    method: 'get' | 'post',
    route: string,
    operation: (body: unknown) => Promise<unknown>
  ) =>
    ctx.registerApi(method, `${prefix}${route}`, async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      try {
        const body = method === 'post' ? await readBody(req as HttpRequest) : undefined
        res.json({ ok: true, result: await operation(body) })
      } catch (error) {
        const status = errorStatus(error)
        logger.warn(`[音卡面板] ${method.toUpperCase()} ${route}：${errorMessage(error)}`)
        res.status(status === 502 || status === 504 ? 503 : status).json({
          ok: false,
          error: errorMessage(error),
          status
        })
      }
    })

  register('get', '/config', async () => {
    const { apiKey, ...settings } = config.config
    return {
      config: settings,
      hasApiKey: Boolean(apiKey),
      platforms: [...new Set([...Object.keys(platforms), ...Object.keys(settings.platforms)])],
      status: (await getServiceStatus()) ?? { enabled: false, bots: [], pending: 0 }
    }
  })

  register('post', '/config', async (body) => {
    const patch = configPatch(objectBody(body))
    await updateSettings(patch)
    return { message: '设置已保存，服务配置已重新加载' }
  })

  register('post', '/sign', async (body) => {
    const input = objectBody(body)
    const request = objectBody(input.request) as MusicRequest
    if (input.forceFresh !== undefined && typeof input.forceFresh !== 'boolean')
      throw new MusicSignError('forceFresh 必须是布尔值')
    const started = performance.now()
    const raw = await signCard(
      {},
      request,
      (message) => {
        throw new MusicSignError(message, 503)
      },
      { forceFresh: input.forceFresh === true }
    )
    return { raw, card: JSON.parse(raw), elapsedMs: Math.round(performance.now() - started) }
  })
}
