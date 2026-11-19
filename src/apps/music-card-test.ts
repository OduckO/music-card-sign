import type { CommandEvent } from '@/types'
import { runCommand } from '@/modules/music-card-sign/dispatch'

export class MusicCardTest extends plugin<'message'> {
  constructor() {
    super({
      name: '音卡签名测试与发卡',
      dsc: '音之测测与签名音卡指令',
      event: 'message',
      priority: -10000,
      namespace: 'music-card-test',
      rule: [
        { reg: '^#?音之测测(?:\\s+[\\s\\S]+)?$', fnc: 'probe' },
        { reg: '^#签名音卡\\s+[\\s\\S]+$', fnc: 'forwardCard' }
      ]
    })
  }

  probe(e: CommandEvent) {
    return runCommand('probe', e)
  }

  forwardCard(e: CommandEvent) {
    return runCommand('forwardCard', e)
  }
}
