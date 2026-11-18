import config from '../../config/index.js';
import { getServiceStatus } from './service.js';
import { replyTemplate } from './render.js';
export async function overview(e, message) {
    if (message && /^(设置|切换)失败/.test(message)) {
        await e.reply(message);
        return true;
    }
    const status = await getServiceStatus();
    const settings = config.config;
    const data = {
        title: e.msg?.includes('设置') ? '音卡设置' : '音卡状态',
        message,
        rows: [
            ['音卡签名服务', status?.enabled ? '开启' : '关闭'],
            ['签名 Bot', settings.botId || '自动选择'],
            ['接收联系人', settings.targetId || '签名 Bot 自己'],
            ['默认签名平台', settings.defaultPlatform],
            ['在线 icqq', status?.bots.join('、') || '无'],
            ['等待请求', String(status?.pending || 0)],
            ['宿主路径', settings.path],
            ['本地端口', settings.localPort ? String(settings.localPort) : '使用云崽现有 HTTP 端口'],
            ['回传超时', `${settings.timeoutMs} ms`],
            ['API Key', settings.apiKey ? '已设置' : '未设置']
        ]
    };
    return replyTemplate(e, 'music/overview', data, [message || data.title, ...data.rows.map(([label, value]) => `${label}  ${value}`)].join('\n'));
}
