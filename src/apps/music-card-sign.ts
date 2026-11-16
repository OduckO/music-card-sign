import type { CommandEvent, MusicEvent, MusicRequest, SignOptions } from '@/types'
import {
  startService,
  stopService,
  signCard,
  isSigningEcho
} from '@/modules/music-card-sign/service'
import { errorMessage } from '@/utils'

export class MusicCardSign extends plugin<'message'> {
  constructor() {
    super({
      name: '本地 icqq 音卡签名',
      dsc: '签名服务生命周期、回包识别与 music.sign Handler',
      event: 'message',
      priority: -Infinity,
      namespace: 'music-card-sign',
      handler: [{ key: 'music.sign', fn: 'signCard' }],
      rule: []
    })
  }

  async init() {
    logger.info('[音卡签名] 应用 init 开始')
    try {
      if (typeof this.addCleanup === 'function') this.addCleanup(stopService, startService)
      await startService()
      logger.info('[音卡签名] 应用 init 完成，签名服务已就绪')
    } catch (error) {
      logger.error(`[音卡签名] 应用 init 失败：${errorMessage(error)}`, error)
      throw error
    }
  }

  onUnload() {
    return stopService()
  }

  accept(e: MusicEvent) {
    return isSigningEcho(e) ? 'return' : false
  }

  signCard(
    e: Pick<CommandEvent, 'self_id'>,
    data: MusicRequest,
    reject: (message: string) => never,
    options?: SignOptions
  ): Promise<string> {
    return signCard(e, data, reject, options)
  }
}
