import { errorMessage } from '../../utils/index.js';
import config from '../../config/index.js';
async function waitForReply(send) {
    const timeoutMs = config.config.timeoutMs;
    let timer;
    try {
        return await Promise.race([
            Promise.resolve().then(send),
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(`等待协议端发送回执超时（${timeoutMs} ms）`)), timeoutMs);
            })
        ]);
    }
    finally {
        clearTimeout(timer);
    }
}
function checkReply(result) {
    const errors = result && typeof result === 'object' && 'error' in result ? result.error : undefined;
    if (!result || (Array.isArray(errors) ? errors.length : errors)) {
        const detail = Array.isArray(errors)
            ? errors.map(errorMessage).join('；')
            : errorMessage(errors);
        throw new Error(errors ? detail : '协议端未返回发送结果');
    }
}
export async function replyNotice(e, message) {
    try {
        checkReply(await waitForReply(() => e.reply(message)));
    }
    catch (error) {
        logger.warn(`[音卡通知] Bot=${e.self_id ?? '未知'} 适配器=${adapterName(e)} 通知失败：${errorMessage(error)}`);
    }
}
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
        let result;
        if (adapter === 'ICQQ' && (e.group_id !== undefined || e.user_id !== undefined)) {
            const sdk = e.self_id === undefined ? undefined : Bot[e.self_id]?.sdk;
            const targetId = Number(e.group_id ?? e.user_id);
            if (!Number.isSafeInteger(targetId) || targetId <= 0)
                throw new Error('当前 ICQQ 会话缺少有效的群号或 QQ 号');
            const send = e.group_id !== undefined ? sdk?.sendGroupMsg : sdk?.sendPrivateMsg;
            if (!sdk || typeof send !== 'function')
                throw new Error('当前 ICQQ 会话没有可用的原生 SDK 发送方法');
            logger.info(`${context} 使用原生 SDK，${e.group_id !== undefined ? '群' : 'QQ'}=${targetId}`);
            result = await waitForReply(() => send.call(sdk, targetId, { type: 'json', data: raw }));
        }
        else {
            result = await waitForReply(() => e.reply(message));
        }
        try {
            checkReply(result);
        }
        catch (error) {
            throw new Error(`当前会话音卡发送失败：${errorMessage(error)}`, { cause: error });
        }
        logger.info(`${context} 发送成功，${Math.round(performance.now() - started)} ms`);
    }
    catch (error) {
        logger.error(`${context} 发送失败：${errorMessage(error)}`, error);
        throw error;
    }
}
