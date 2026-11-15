import config from '@/config'
import { PluginPath } from '@/dir'
import path from 'node:path'
import type { BotCandidate, CommandEvent, Config, MusicRequest, SignOptions } from '@/types'
import type { ExpressHost } from '@/models/http'
import { errorMessage } from '@/utils'
import { MusicSigner, cardText } from '@/models/music-sign'
import { mountService } from '@/models/http'
import { MusicCardCache } from '@/models/music-cache'

const settings = config.config
let service: { signer: MusicSigner; unmount: () => Promise<void> } | null = null
let lifecycle = Promise.resolve()

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = lifecycle.then(operation)
  lifecycle = result.then(
    () => {},
    () => {}
  )
  return result
}

async function saveSettings() {
  await config.configSave()
}

function getBots() {
  return Array.from(Bot.uin || [])
    .map((id) => Bot[id])
    .filter((bot) => bot?.adapter?.name === 'ICQQ') as BotCandidate[]
}

async function start() {
  if (service || !settings.enabled) return
  if (!Bot.express?.use) throw new Error('音卡签名插件需要云崽 Bot.express')
  const signer = new MusicSigner({
    getBots,
    botId: settings.botId,
    timeoutMs: settings.timeoutMs,
    customPlatforms: settings.platforms,
    cache: new MusicCardCache(path.join(PluginPath, 'data/music-card-cache')),
    onCacheError: (error) => logger.warn(`[音卡缓存] ${errorMessage(error)}`)
  })
  try {
    const unmount = await mountService(Bot.express as ExpressHost, signer, settings)
    service = { signer, unmount }
    logger.mark(
      `[音卡签名] 已挂载 ${settings.path}` +
        (settings.localPort ? `，本地端口 ${settings.localPort}` : '')
    )
  } catch (error) {
    await signer.close()
    throw error
  }
}

async function stop() {
  const current = service
  service = null
  if (!current) return
  await current.signer.close()
  await current.unmount()
}

export function startService() {
  return serialize(start)
}

export function stopService() {
  return serialize(stop)
}

export async function getServiceStatus() {
  await lifecycle
  return service?.signer.status()
}

export async function getTestMusic() {
  await lifecycle
  return settings.testMusic
}

export function updateSettings(patch: Partial<Config>) {
  return serialize(async () => {
    const previous = { ...settings }
    Object.assign(settings, patch)
    try {
      await stop()
      await start()
      await saveSettings()
    } catch (error) {
      Object.assign(settings, previous)
      await stop()
      await start()
      throw error
    }
  })
}

export function setServiceEnabled(enabled: boolean) {
  return serialize(async () => {
    const previous = settings.enabled
    settings.enabled = enabled
    try {
      if (enabled) await start()
      else await stop()
      await saveSettings()
      return `音乐签名服务已${enabled ? '开启' : '关闭'}`
    } catch (error) {
      settings.enabled = previous
      if (previous) await start()
      else await stop()
      return `切换失败：${errorMessage(error)}`
    }
  })
}

export function setSigningBot(botId: string) {
  return serialize(async () => {
    const previous = settings.botId
    settings.botId = botId
    try {
      await saveSettings()
    } catch (error) {
      settings.botId = previous
      return `设置失败：${errorMessage(error)}`
    }
    if (service) service.signer.botId = botId
    return botId ? `音乐签名 Bot 已设为 ${botId}。` : '音乐签名 Bot 已恢复自动选择。'
  })
}

export async function signCard(
  e: Pick<CommandEvent, 'self_id'>,
  data: MusicRequest,
  reject: (message: string) => never,
  options?: SignOptions
): Promise<string> {
  await lifecycle
  if (!service) return reject('音卡签名服务未开启')
  const card = await service.signer.sign(
    { ...data, self_id: data.self_id || settings.botId || e.self_id },
    options
  )
  return cardText(card)
}
