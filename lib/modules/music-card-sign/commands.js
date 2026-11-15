import config from '../../config/index.js';
import { errorMessage } from '../../utils/index.js';
import { getServiceStatus, getTestMusic, setServiceEnabled, setSigningBot, updateSettings, signCard } from './service.js';
import { adapterName, replyCard, replyNotice } from './send.js';
export async function status(e) {
    const serviceStatus = await getServiceStatus();
    const settings = config.config;
    await e.reply([
        `音卡签名服务：${serviceStatus?.enabled ? '开启' : '关闭'}`,
        `签名 Bot：${settings.botId || '自动选择'}`,
        `接收联系人：${settings.targetId || '签名 Bot 自己'}`,
        `在线 icqq：${serviceStatus?.bots.join('、') || '无'}`,
        `等待请求：${serviceStatus?.pending || 0}`,
        `宿主路径：${settings.path}`,
        settings.localPort
            ? `本地地址：http://127.0.0.1:${settings.localPort}${settings.path}`
            : '使用云崽现有 HTTP 端口'
    ].join('\n'));
    return true;
}
export async function toggle(e) {
    const message = await setServiceEnabled(e.msg.includes('开启'));
    await e.reply(message);
    return true;
}
export async function setBot(e) {
    const value = e.msg.replace(/^#设置音乐签名(?:bot|账号)/i, '').trim();
    if (!value) {
        await e.reply('用法：#设置音乐签名Bot <QQ号>，或 #设置音乐签名Bot 自动');
        return true;
    }
    const botId = ['自动', '清除'].includes(value) ? '' : value;
    if (botId && (!/^[1-9]\d*$/.test(botId) || !Number.isSafeInteger(Number(botId)))) {
        await e.reply('Bot 号必须是有效的正整数 QQ 号，或填写「自动」。');
        return true;
    }
    const message = await setSigningBot(botId);
    await e.reply(message);
    return true;
}
export async function setTarget(e) {
    const value = e.msg.replace(/^#设置音乐签名联系人/, '').trim();
    if (!value) {
        await e.reply('用法：#设置音乐签名联系人 <QQ号>，或 #设置音乐签名联系人 自己');
        return true;
    }
    const targetId = ['自己', '清除'].includes(value) ? '' : value;
    if (targetId && (!/^[1-9]\d*$/.test(targetId) || !Number.isSafeInteger(Number(targetId)))) {
        await e.reply('联系人必须是有效的正整数 QQ 号，或填写「自己」。');
        return true;
    }
    let message;
    try {
        await updateSettings({ targetId });
        message = targetId
            ? `音乐签名接收联系人已设为 ${targetId}。`
            : '音乐签名已恢复发给签名 Bot 自己。';
    }
    catch (error) {
        message = `设置失败：${errorMessage(error)}`;
    }
    await e.reply(message);
    return true;
}
export async function forwardCard(e) {
    logger.info(`[音卡指令] 签名音卡 Bot=${e.self_id ?? '未知'} 适配器=${adapterName(e)}`);
    try {
        const data = JSON.parse(e.msg.replace(/^#签名音卡\s+/, ''));
        const raw = await signCard(e, data, (message) => {
            throw new Error(message);
        });
        await replyCard(e, raw);
    }
    catch (error) {
        logger.error(`[音卡指令] 签名音卡失败：${errorMessage(error)}`, error);
        await replyNotice(e, `音卡签名失败：${errorMessage(error)}`);
    }
    return true;
}
export async function probe(e) {
    const started = performance.now();
    let phase = '读取测试配置';
    logger.info(`[音卡指令] 音之测测开始 Bot=${e.self_id ?? '未知'} 适配器=${adapterName(e)}`);
    const progress = replyNotice(e, '音之测测开始，正在检查 icqq 签名与 JSON 回传，请稍候。');
    try {
        logger.info('[音卡指令] 正在读取测试配置');
        const defaultMusic = await getTestMusic();
        const supplied = e.msg.replace(/^#?音之测测/, '').trim();
        const data = supplied ? JSON.parse(supplied) : defaultMusic;
        phase = '生成/回传';
        logger.info('[音卡指令] 测试配置已读取，开始签名与 JSON 回传');
        const raw = await signCard(e, data, (message) => {
            throw new Error(message);
        }, { forceFresh: true });
        phase = '当前会话发送';
        await replyCard(e, raw);
        const message = `音之测测通过，耗时 ${Math.round(performance.now() - started)} ms。\n已捕获签名 Bot 发出的音卡 JSON，并发送到当前会话。`;
        logger.info(`[音卡指令] ${message}`);
        await replyNotice(e, message);
    }
    catch (error) {
        logger.error(`[音卡指令] 音之测测失败（${phase}）：${errorMessage(error)}`, error);
        await replyNotice(e, `音之测测失败（${phase}，${Math.round(performance.now() - started)} ms）：${errorMessage(error)}`);
    }
    finally {
        await progress;
    }
    return true;
}
