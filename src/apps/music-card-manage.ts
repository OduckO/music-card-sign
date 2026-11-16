import type { CommandEvent } from '@/types'
import {
  help,
  status,
  toggle,
  setBot,
  setTarget,
  setPlatform
} from '@/modules/music-card-sign/commands'
import { updatePlugin } from '@/modules/music-card-sign/update'

export class MusicCardManage extends plugin<'message'> {
  constructor() {
    super({
      name: '音卡签名管理',
      dsc: '帮助、状态、账号、联系人、平台、服务开关与更新',
      event: 'message',
      priority: -10000,
      namespace: 'music-card-manage',
      rule: [
        { reg: '^#音乐签名(?:帮助)?$', fnc: 'help', permission: 'master' },
        { reg: '^#音乐签名状态$', fnc: 'status', permission: 'master' },
        {
          reg: '^#设置音乐签名平台(?:\\s+[\\s\\S]+)?$',
          fnc: 'setPlatform',
          permission: 'master'
        },
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
        {
          reg: '^#音乐签名(?:强制更新|更新(?:日志)?)$',
          fnc: 'update',
          permission: 'master'
        }
      ]
    })
  }

  help(e: CommandEvent) {
    return help(e)
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

  setPlatform(e: CommandEvent) {
    return setPlatform(e)
  }

  update(e: CommandEvent) {
    return updatePlugin(e)
  }
}
