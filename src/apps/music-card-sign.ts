import type { CommandEvent, MusicRequest, SignOptions } from '@/types'
import { startService, stopService, signCard } from '@/modules/music-card-sign/service'
import {
  status,
  toggle,
  setBot,
  setTarget,
  forwardCard,
  probe
} from '@/modules/music-card-sign/commands'
import { errorMessage } from '@/utils'
import { updatePlugin } from '@/modules/music-card-sign/update'

export class MusicCardSign extends plugin<'message'> {
  constructor() {
    super({
      name: '本地 icqq 音卡签名',
      dsc: '分享给指定联系人并捕获音卡 JSON，提供签名 API 与当前会话转发',
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
        {
          reg: '^#设置音乐签名联系人(?:\\s+[\\s\\S]+)?$',
          fnc: 'setTarget',
          permission: 'master'
        },
        { reg: '^#?音之测测(?:\\s+[\\s\\S]+)?$', fnc: 'probe', permission: 'master' },
        { reg: '^#签名音卡\\s+[\\s\\S]+$', fnc: 'forwardCard', permission: 'master' },
        {
          reg: '^#音乐签名(?:强制更新|更新(?:日志)?)$',
          fnc: 'update',
          permission: 'master'
        }
      ]
    })
  }

  async init() {
    logger.info('[音卡签名] 应用 init 开始')
    try {
      if (typeof this.addCleanup === 'function') this.addCleanup(stopService, startService)
      await startService()
      logger.info('[音卡签名] 应用 init 完成，已注册音之测测')
    } catch (error) {
      logger.error(`[音卡签名] 应用 init 失败：${errorMessage(error)}`, error)
      throw error
    }
  }

  onUnload() {
    return stopService()
  }

  status(e: CommandEvent) {
    return status(e)
  }

  toggle(e: CommandEvent) {
    return toggle(e)
  }

  setBot(e: CommandEvent) {
    return setBot(e)
  }

  setTarget(e: CommandEvent) {
    return setTarget(e)
  }

  signCard(
    e: Pick<CommandEvent, 'self_id'>,
    data: MusicRequest,
    reject: (message: string) => never,
    options?: SignOptions
  ): Promise<string> {
    return signCard(e, data, reject, options)
  }

  forwardCard(e: CommandEvent) {
    return forwardCard(e)
  }

  probe(e: CommandEvent) {
    return probe(e)
  }

  update(e: CommandEvent) {
    return updatePlugin(e)
  }
}
