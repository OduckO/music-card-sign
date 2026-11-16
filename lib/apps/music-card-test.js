export class MusicCardTest extends plugin {
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
        });
    }
    async probe(e) {
        const { probe } = await import('../modules/music-card-sign/commands.js');
        return probe(e);
    }
    async forwardCard(e) {
        const { forwardCard } = await import('../modules/music-card-sign/commands.js');
        return forwardCard(e);
    }
}
