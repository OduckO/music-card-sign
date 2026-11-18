import type { RequestHandler } from 'express'
import { join } from 'node:path'
import { PluginPath } from '@/dir'
import config from '@/config'
import type { HttpRequest, MusicRequest } from '@/types'
import { readBody } from '@/models/http'
import { MusicSignError, platforms } from '@/models/music-sign'
import {
  getServiceStatus,
  getSigningBots,
  getSigningFriends,
  signCard,
  updateSettings
} from '@/modules/music-card-sign/service'
import { configPatch } from '@/modules/music-card-sign/settings'
import { errorMessage, errorStatus } from '@/utils'

export interface PageContext {
  apiBase: string
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
  // QQBot-Web 的 apiBase 是全局 /api，锅巴已包含插件路径。
  const prefix = ctx.apiBase.replace(/\/$/, '').endsWith('/api') ? '/music-card-sign' : ''
  ctx.registerPage({
    id: 'music-card-sign',
    title: '音乐签名',
    icon: 'solar:music-notes-bold-duotone',
    src: 'panel.html',
    style: 'app.css',
    script: 'app.js',
    priority: 70
  })

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
      accounts: getSigningBots().map((bot) => ({
        id: String(bot.uin),
        name: bot.nickname || String(bot.uin)
      })),
      platforms: [...new Set([...Object.keys(platforms), ...Object.keys(settings.platforms)])],
      status: (await getServiceStatus()) ?? { enabled: false, bots: [], pending: 0 }
    }
  })

  register('post', '/friends', async (body) => {
    const input = objectBody(body)
    const { botId = config.config.botId } = configPatch({
      botId: input.botId ?? config.config.botId
    })
    return getSigningFriends(botId)
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

  for (const weight of ['Regular', 'Bold']) {
    ctx.registerApi('get', `${prefix}/fonts/${weight}`, (_req, res) => {
      res.sendFile(join(PluginPath, 'webadapter/fonts', `HarmonyOS_Sans_SC_${weight}.woff2`), {
        maxAge: '7d'
      })
    })
  }
}
