import { startService, stopService, signCard } from '../modules/music-card-sign/service.js';
import { status, toggle, setBot, forwardCard, probe } from '../modules/music-card-sign/commands.js';
export class MusicCardSign extends plugin {
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
        });
    }
    async init() {
        this.addCleanup(stopService, startService);
        await startService();
    }
    status(e) {
        return status(e);
    }
    toggle(e) {
        return toggle(e);
    }
    setBot(e) {
        return setBot(e);
    }
    signCard(e, data, reject, options) {
        return signCard(e, data, reject, options);
    }
    forwardCard(e) {
        return forwardCard(e);
    }
    probe(e) {
        return probe(e);
    }
}
