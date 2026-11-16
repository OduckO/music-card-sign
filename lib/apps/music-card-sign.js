import { errorMessage } from '../utils/index.js';
import { signingEchoes } from '../models/music-echo.js';
export class MusicCardSign extends plugin {
    constructor() {
        super({
            name: '本地 icqq 音卡签名',
            dsc: '签名服务生命周期、回包识别与 music.sign Handler',
            event: 'message',
            priority: -Infinity,
            namespace: 'music-card-sign',
            handler: [{ key: 'music.sign', fn: 'signCard' }],
            rule: []
        });
    }
    async init() {
        logger.info('[音卡签名] 应用 init 开始');
        try {
            const { startService, stopService } = await import('../modules/music-card-sign/service.js');
            if (typeof this.addCleanup === 'function')
                this.addCleanup(stopService, startService);
            await startService();
            logger.info('[音卡签名] 应用 init 完成，签名服务已就绪');
        }
        catch (error) {
            logger.error(`[音卡签名] 应用 init 失败：${errorMessage(error)}`, error);
            throw error;
        }
    }
    async onUnload() {
        const { stopService } = await import('../modules/music-card-sign/service.js');
        return stopService();
    }
    accept(e) {
        if (signingEchoes.has(e))
            return 'return';
        if (e.group_id || (e.message_type && e.message_type !== 'private'))
            return false;
        const from = e.from_id ?? e.user_id ?? e.sender?.user_id;
        if (e.self_id !== undefined && from !== undefined && String(from) !== String(e.self_id))
            return false;
        return import('../modules/music-card-sign/service.js').then(({ isSigningEcho }) => isSigningEcho(e) ? 'return' : false);
    }
    async signCard(e, data, reject, options) {
        const { signCard } = await import('../modules/music-card-sign/service.js');
        return signCard(e, data, reject, options);
    }
}
