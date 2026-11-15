import type { CommandEvent, MusicRequest, SignOptions } from '@/types'
import { startService, stopService, signCard } from '@/modules/music-card-sign/service'
import { status, toggle, setBot, forwardCard, probe } from '@/modules/music-card-sign/commands'

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
    this.addCleanup(stopService, startService)
    await startService()
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
}
