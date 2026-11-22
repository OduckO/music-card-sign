import type { CommandEvent } from '@/types'
import { runCommand } from '@/modules/music-card-sign/dispatch'

export class MusicCardManage extends plugin<'message'> {
  constructor() {
    super({
      name: '音卡签名管理',
      dsc: '帮助、状态、账号、联系人、平台、服务开关与更新',
      event: 'message',
      priority: -Infinity,
      namespace: 'music-card-manage',
      rule: [
        { reg: '^#音乐签名(?:帮助)?$', fnc: 'help' },
        { reg: '^#音乐签名状态$', fnc: 'status' },
        {
          reg: '^#设置音乐签名平台(?:\\s+[\\s\\S]+)?$',
          fnc: 'setPlatform'
        },
        {
          reg: '^#设置音乐签名(?:[Bb][Oo][Tt]|账号)(?:\\s+[\\s\\S]+)?$',
          fnc: 'setBot'
        },
        { reg: '^#(开启|关闭)音乐签名服务$', fnc: 'toggle' },
        {
          reg: '^#设置音乐签名联系人(?:\\s+[\\s\\S]+)?$',
          fnc: 'setTarget'
        },
        { reg: '^#设置音乐签名超时(?:\\s+[\\s\\S]+)?$', fnc: 'setTimeout' },
        {
          reg: '^#音乐签名(?:强制更新|更新(?:日志)?)$',
          fnc: 'update'
        }
      ]
    })
  }

  help(e: CommandEvent) {
    return runCommand('help', e)
  }

  status(e: CommandEvent) {
    return runCommand('status', e)
  }

  toggle(e: CommandEvent) {
    return runCommand('toggle', e)
  }

  setBot(e: CommandEvent) {
    return runCommand('setBot', e)
  }

  setTarget(e: CommandEvent) {
    return runCommand('setTarget', e)
  }

  setPlatform(e: CommandEvent) {
    return runCommand('setPlatform', e)
  }

  setTimeout(e: CommandEvent) {
    return runCommand('setTimeout', e)
  }

  update(e: CommandEvent) {
    return runCommand('update', e)
  }
}
