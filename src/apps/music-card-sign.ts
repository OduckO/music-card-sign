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

async function replyCard(e: Pick<CommandEvent, 'reply'>, raw: string) {
  const result = await e.reply({ type: 'json', data: raw })
  if (!result || (Array.isArray(result.error) ? result.error.length : result.error)) {
    throw new Error('当前会话音卡发送失败，请检查协议端 JSON 支持')
  }
}

export class MusicCardSign extends plugin<'message'> {
  constructor() {
    super({
      name: '本地 icqq 音卡签名',
      dsc: '发给自己并捕获音卡 JSON，提供签名 API 与当前会话转发',
      event: 'message',
      priority: 5000,
      namespace: 'music-card-sign',
      handler: [{ key: 'music.sign', fn: 'signCard' }],
      rule: [
        { reg: '^#音乐签名状态$', fnc: 'status', permission: 'master' },
        {
          reg: '^#设置音乐签名(?:[Bb][Oo][Tt]|账号)(?:\\s+[\\s\\S]+)?$',
          fnc: 'setBot',
          permission: 'master'
        },
        { reg: '^#(开启|关闭)音乐签名服务$', fnc: 'toggle', permission: 'master' },
        { reg: '^#?音之测测(?:\\s+[\\s\\S]+)?$', fnc: 'probe', permission: 'master' },
        { reg: '^#签名音卡\\s+[\\s\\S]+$', fnc: 'forwardCard', permission: 'master' }
      ]
    })
  }

  async init() {
    this.addCleanup(
      () => serialize(stop),
      () => serialize(start)
    )
    await serialize(async () => {
      await start()
    })
  }

  async status(e: CommandEvent) {
    await lifecycle
    const status = service?.signer.status()
    await e.reply(
      [
        `音卡签名服务：${status?.enabled ? '开启' : '关闭'}`,
        `签名 Bot：${settings.botId || '自动选择'}`,
        `在线 icqq：${status?.bots.join('、') || '无'}`,
        `等待请求：${status?.pending || 0}`,
        `宿主路径：${settings.path}`,
        settings.localPort
          ? `本地地址：http://127.0.0.1:${settings.localPort}${settings.path}`
          : '使用云崽现有 HTTP 端口'
      ].join('\n')
    )
    return true
  }

  async toggle(e: CommandEvent) {
    const enabled = e.msg.includes('开启')
    const message = await serialize(async () => {
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
    await e.reply(message)
    return true
  }

  async setBot(e: CommandEvent) {
    const value = e.msg.replace(/^#设置音乐签名(?:bot|账号)/i, '').trim()
    if (!value) {
      await e.reply('用法：#设置音乐签名Bot <QQ号>，或 #设置音乐签名Bot 自动')
      return true
    }
    const botId = ['自动', '清除'].includes(value) ? '' : value
    if (botId && (!/^[1-9]\d*$/.test(botId) || !Number.isSafeInteger(Number(botId)))) {
      await e.reply('Bot 号必须是有效的正整数 QQ 号，或填写「自动」。')
      return true
    }
    const message = await serialize(async () => {
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
    await e.reply(message)
    return true
  }

  async signCard(
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

  async forwardCard(e: CommandEvent) {
    try {
      const data = JSON.parse(e.msg.replace(/^#签名音卡\s+/, ''))
      const raw = await this.signCard(e, data, (message) => {
        throw new Error(message)
      })
      await replyCard(e, raw)
    } catch (error) {
      await e.reply(`音卡签名失败：${errorMessage(error)}`)
    }
    return true
  }

  async probe(e: CommandEvent) {
    const started = performance.now()
    let phase = '生成/回传'
    try {
      await lifecycle
      const supplied = e.msg.replace(/^#?音之测测/, '').trim()
      const data = supplied ? JSON.parse(supplied) : settings.testMusic
      const raw = await this.signCard(
        e,
        data,
        (message) => {
          throw new Error(message)
        },
        { forceFresh: true }
      )
      phase = '当前会话发送'
      await replyCard(e, raw)
    } catch (error) {
      await e.reply(
        `音之测测失败（${phase}，${Math.round(performance.now() - started)} ms）：${errorMessage(error)}`
      )
      return true
    }
    await e.reply(
      `音之测测通过，耗时 ${Math.round(performance.now() - started)} ms。\n已收到 bot 自己的音卡 JSON，并发送到当前会话。`
    )
    return true
  }
}
