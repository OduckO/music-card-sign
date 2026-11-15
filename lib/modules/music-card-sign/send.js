import { errorMessage } from '../../utils/index.js';
export function adapterName(e) {
    return (e.bot?.adapter?.name ??
        (e.self_id === undefined ? undefined : Bot[e.self_id]?.adapter?.name) ??
        'ICQQ');
}
export async function replyCard(e, raw) {
    const adapter = adapterName(e);
    const started = performance.now();
    const context = `[音卡发送] Bot=${e.self_id ?? '未知'} 适配器=${adapter}`;
    logger.info(`${context} 开始发送 JSON，${Buffer.byteLength(raw)} 字节`);
    try {
        if (!['ICQQ', 'OneBotv11'].includes(adapter))
            throw new Error(`当前会话适配器 ${adapter} 尚不支持转发已签名音卡 JSON`);
        // raw 让 TRSS 保留 OneBot 消息结构，避免补丁再次序列化 JSON 原文。
        const message = adapter === 'OneBotv11'
            ? segment.raw({ type: 'json', data: { data: raw } })
            : { type: 'json', data: raw };
        const result = await e.reply(message);
        const errors = result?.error;
        if (!result || (Array.isArray(errors) ? errors.length : errors)) {
            const detail = Array.isArray(errors)
                ? errors.map(errorMessage).join('；')
                : errorMessage(errors);
            throw new Error(`当前会话音卡发送失败：${errors ? detail : '协议端未返回发送结果'}`);
        }
        logger.info(`${context} 发送成功，${Math.round(performance.now() - started)} ms`);
    }
    catch (error) {
        logger.error(`${context} 发送失败：${errorMessage(error)}`, error);
        throw error;
    }
}
