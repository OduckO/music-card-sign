import config from '@/config'
import { PluginPath } from '@/dir'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import type {
  AccountOption,
  BotAdapter,
  BotCandidate,
  CommandEvent,
  Config,
  MusicEvent,
  MusicRequest,
  SignOptions
} from '@/types'
import type { ExpressHost } from '@/models/http'
import { errorMessage } from '@/utils'
import {
  MusicSigner,
  MusicSignError,
  cardText,
  nativeBot,
  selectPlatform
} from '@/models/music-sign'
import { mountService } from '@/models/http'
import { MusicCardCache } from '@/models/music-cache'
import { resolveWithHandler } from './resolver'

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

function getBots() {
  return Array.from(Bot.uin || [])
    .map((id) => Bot[id])
    .filter((bot) => bot?.adapter?.name === 'ICQQ') as BotCandidate[]
}

export const getSigningBots = () => getBots().flatMap((bot) => nativeBot(bot) ?? [])

export const getCommandBots = (): AccountOption[] =>
  Array.from(Bot.uin || []).flatMap((id) => {
    const bot = Bot[id] as (typeof Bot)[number] & BotAdapter & { online?: boolean }
    if (!bot) return []
    const sdk = bot.sdk ?? bot
    if (
      bot.online === false ||
      sdk.online === false ||
      (typeof sdk.isOnline === 'function' && !sdk.isOnline())
    )
      return []
    return [
      {
        id: String(id),
        name: `${bot.nickname || sdk.nickname || id} · ${bot.adapter?.name || '未知适配器'}`
      }
    ]
  })

export function getSigningFriends(botId: string) {
  const bots = getSigningBots()
  const bot = botId
    ? bots.find((candidate) => String(candidate.uin) === botId)
    : bots.length === 1
      ? bots[0]
      : undefined
  if (botId && !bot) throw new MusicSignError('未找到指定的在线 icqq 账号', 503)
  return {
    botId: bot ? String(bot.uin) : '',
    friends: Array.from(bot?.fl ?? [], ([id, friend]) => ({
      id: String(id),
      name: friend.remark || friend.nickname || String(id)
    }))
  }
}

async function start() {
  if (service || !settings.enabled) return
  logger.info(
    `[音卡签名] 正在启动，签名 Bot=${settings.botId || '自动'}，接收联系人=${settings.targetId || '签名 Bot 自己'}，默认平台=${settings.defaultPlatform}，回传超时=${settings.timeoutMs} ms`
  )
  if (!Bot.express?.use) throw new Error('音卡签名插件需要云崽 Bot.express')
  const signer = new MusicSigner({
    getBots,
    botId: settings.botId,
    targetId: settings.targetId,
    timeoutMs: settings.timeoutMs,
    customPlatforms: settings.platforms,
    defaultPlatform: settings.defaultPlatform,
    resolveMusic: resolveWithHandler,
    cache: new MusicCardCache(path.join(PluginPath, 'data/music-card-cache')),
    onCacheError: (error) => logger.warn(`[音卡缓存] ${errorMessage(error)}`),
    onLog: (level, message) => logger[level](`[音卡签名] ${message}`)
  })
  try {
    const unmount = await mountService(Bot.express as ExpressHost, signer, {
      ...settings,
      onLog: (level, message) => logger[level](`[音卡 HTTP] ${message}`)
    })
    service = { signer, unmount }
    logger.mark(
      `[音卡签名] 已挂载 ${settings.path}` +
        (settings.localPort
          ? `，本地端口 ${settings.localPort}`
          : '，使用云崽 HTTP 端口（受宿主鉴权控制）') +
        `，在线 icqq=${signer.status().bots.join('、') || '无'}`
    )
  } catch (error) {
    logger.error(`[音卡签名] 启动失败：${errorMessage(error)}`, error)
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
  logger.info('[音卡签名] 服务已关闭')
}

export const startService = () => serialize(start)
export const stopService = () => serialize(stop)

export async function getServiceStatus() {
  await lifecycle
  return service?.signer.status()
}

export async function getTestMusic() {
  await lifecycle
  return settings.testMusic
}

export function isSigningEcho(event: MusicEvent) {
  return service?.signer.isSigningEcho(event) ?? false
}

export function updateSettings(patch: Partial<Config>) {
  return serialize(async () => {
    selectPlatform(
      {},
      patch.platforms ?? settings.platforms,
      patch.defaultPlatform ?? settings.defaultPlatform
    )
    const restart = (
      [
        'enabled',
        'botId',
        'targetId',
        'timeoutMs',
        'path',
        'apiKey',
        'localPort',
        'defaultPlatform',
        'platforms'
      ] as const
    ).some((key) => Object.hasOwn(patch, key) && !isDeepStrictEqual(patch[key], settings[key]))
    const previous = { ...settings }
    Object.assign(settings, patch)
    try {
      if (restart) {
        await stop()
        await start()
      }
      await config.configSave()
    } catch (error) {
      Object.assign(settings, previous)
      if (restart) {
        await stop()
        await start()
      }
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
      await config.configSave()
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
      await config.configSave()
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
  logger.info('[音卡签名] Handler 收到请求')
  await lifecycle
  if (!service) return reject('音卡签名服务未开启')
  const card = await service.signer.sign(
    {
      ...data,
      self_id:
        data.self_id ||
        data.bot_id ||
        settings.botId ||
        (e.self_id !== undefined && Bot[e.self_id]?.adapter?.name === 'ICQQ' ? e.self_id : '')
    },
    options
  )
  return cardText(card)
}
