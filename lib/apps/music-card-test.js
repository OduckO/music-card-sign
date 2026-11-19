import { runCommand } from '../modules/music-card-sign/dispatch.js';
export class MusicCardTest extends plugin {
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
        });
    }
    probe(e) {
        return runCommand('probe', e);
    }
    forwardCard(e) {
        return runCommand('forwardCard', e);
    }
}
