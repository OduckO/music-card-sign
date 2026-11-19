import { MusicSignError, selectPlatform } from '@/models/music-sign'
import type { Config, PlatformInput } from '@/types'

function objectValue(value: unknown, label: string): Record<string, unknown> {
  let parsed = value
  try {
    if (typeof parsed === 'string') parsed = JSON.parse(parsed)
  } catch {
    throw new MusicSignError(`${label} 必须是有效的 JSON 对象`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new MusicSignError(`${label} 必须是 JSON 对象`)
  return parsed as Record<string, unknown>
}

function stringValue(value: unknown, label: string) {
  if (typeof value !== 'string') throw new MusicSignError(`${label} 必须是字符串`)
  return value
}

function integerValue(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max)
    throw new MusicSignError(`${label} 必须是 ${min} 到 ${max} 的整数`)
  return value
}

export function configPatch(data: Record<string, unknown>): Partial<Config> {
  const patch: Partial<Config> = {}
  if (Object.hasOwn(data, 'enabled')) {
    if (typeof data.enabled !== 'boolean') throw new MusicSignError('服务开关必须是布尔值')
    patch.enabled = data.enabled
  }
  if (Object.hasOwn(data, 'commandBotMode')) {
    if (
      data.commandBotMode !== 'off' &&
      data.commandBotMode !== 'blacklist' &&
      data.commandBotMode !== 'whitelist'
    )
      throw new MusicSignError('聊天指令响应模式必须是 off、blacklist 或 whitelist')
    patch.commandBotMode = data.commandBotMode
  }
  for (const key of ['commandBotBlacklist', 'commandBotWhitelist'] as const) {
    if (!Object.hasOwn(data, key)) continue
    const list = data[key]
    if (!Array.isArray(list)) throw new MusicSignError('Bot 名单必须是数组')
    patch[key] = [
      ...new Set(
        list.map((value: unknown) => {
          if (typeof value !== 'string' && typeof value !== 'number')
            throw new MusicSignError('Bot 名单只能包含 Bot 号')
          const id = String(value).trim()
          if (!id) throw new MusicSignError('Bot 名单不能包含空号')
          return id
        })
      )
    ]
  }
  if (Object.hasOwn(data, 'botId')) {
    patch.botId = stringValue(data.botId, 'Bot 号').trim()
    if (
      patch.botId &&
      (!/^[1-9]\d*$/.test(patch.botId) || !Number.isSafeInteger(Number(patch.botId)))
    )
      throw new MusicSignError('Bot 号必须是有效的正整数 QQ 号，或留空')
  }
  if (Object.hasOwn(data, 'targetId')) {
    patch.targetId = stringValue(data.targetId, '联系人 QQ 号').trim()
    if (
      patch.targetId &&
      (!/^[1-9]\d*$/.test(patch.targetId) || !Number.isSafeInteger(Number(patch.targetId)))
    )
      throw new MusicSignError('联系人必须是有效的正整数 QQ 号，或留空')
  }
  if (Object.hasOwn(data, 'path')) {
    patch.path = stringValue(data.path, '签名路由').trim()
    if (!/^\/[\w/-]+$/.test(patch.path) || patch.path.endsWith('/'))
      throw new MusicSignError('签名路由必须以 / 开头且不带结尾斜杠')
  }
  if (Object.hasOwn(data, 'apiKey')) patch.apiKey = stringValue(data.apiKey, 'API Key')
  if (Object.hasOwn(data, 'localPort'))
    patch.localPort = integerValue(data.localPort, '本地端口', 0, 65535)
  if (Object.hasOwn(data, 'timeoutMs'))
    patch.timeoutMs = integerValue(data.timeoutMs, '超时', 1, 2147483647)
  if (Object.hasOwn(data, 'testMusic')) patch.testMusic = objectValue(data.testMusic, '测试歌曲')
  if (Object.hasOwn(data, 'defaultPlatform'))
    patch.defaultPlatform = stringValue(data.defaultPlatform, '默认签名平台').trim().toLowerCase()
  if (Object.hasOwn(data, 'platforms')) {
    const entries = objectValue(data.platforms, '平台映射')
    patch.platforms = Object.fromEntries(
      Object.entries(entries).map(([name, value]) => {
        if (!name.trim()) throw new MusicSignError('平台名称不能为空')
        const platform = objectValue(value, `平台 ${name}`) as unknown as PlatformInput
        selectPlatform({ _platform: platform }, {})
        return [name, platform]
      })
    )
  }
  return patch
}
