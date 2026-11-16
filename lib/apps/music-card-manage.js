import { help, status, toggle, setBot, setTarget, setPlatform } from '../modules/music-card-sign/commands.js';
import { updatePlugin } from '../modules/music-card-sign/update.js';
export class MusicCardManage extends plugin {
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
        });
    }
    help(e) {
        return help(e);
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
    setTarget(e) {
        return setTarget(e);
    }
    setPlatform(e) {
        return setPlatform(e);
    }
    update(e) {
        return updatePlugin(e);
    }
}
