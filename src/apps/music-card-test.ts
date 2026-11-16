import type { CommandEvent } from '@/types'
import { forwardCard, probe } from '@/modules/music-card-sign/commands'

export class MusicCardTest extends plugin<'message'> {
  constructor() {
    super({
      name: '音卡签名测试与发卡',
      dsc: '音之测测与签名音卡指令',
      event: 'message',
      priority: -10000,
      namespace: 'music-card-test',
      rule: [
        { reg: '^#?音之测测(?:\\s+[\\s\\S]+)?$', fnc: 'probe', permission: 'master' },
        { reg: '^#签名音卡\\s+[\\s\\S]+$', fnc: 'forwardCard', permission: 'master' }
      ]
    })
  }

  probe(e: CommandEvent) {
    return probe(e)
  }

  forwardCard(e: CommandEvent) {
    return forwardCard(e)
  }
}
