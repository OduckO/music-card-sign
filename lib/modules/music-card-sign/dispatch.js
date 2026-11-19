export async function runCommand(name, e) {
    const { default: config } = await import('../../config/index.js');
    const { commandBotMode, commandBotBlacklist, commandBotWhitelist } = config.config;
    const botId = String(e.self_id ?? '');
    const context = `[音卡指令] Bot=${botId || '未知'} 用户=${e.user_id ?? '未知'} 指令=${name}`;
    if ((commandBotMode === 'blacklist' && commandBotBlacklist.includes(botId)) ||
        (commandBotMode === 'whitelist' && !commandBotWhitelist.includes(botId))) {
        const reason = commandBotMode === 'blacklist'
            ? '该 Bot 在黑名单中'
            : commandBotWhitelist.length
                ? '该 Bot 不在白名单中'
                : '白名单为空，所有 Bot 的聊天指令都已静默';
        logger.warn(`${context} 已静默忽略：${reason}。要开启该 Bot 的聊天指令响应，请在锅巴或 WebUI 的「聊天指令响应」中${commandBotMode === 'blacklist' ? '将该 Bot 从黑名单移除' : '将该 Bot 加入白名单'}，或将响应模式设为「关闭限制」；签名服务不受影响。`);
        return true;
    }
    if (name !== 'help' && !e.isMaster) {
        logger.warn(`${context} 已静默忽略：仅主人可执行此指令。`);
        return true;
    }
    if (name === 'help') {
        const { help } = await import('./help.js');
        return help(e);
    }
    if (name === 'update') {
        const { updatePlugin } = await import('./update.js');
        return updatePlugin(e);
    }
    if (name === 'status') {
        const { overview } = await import('./overview.js');
        return overview(e);
    }
    const commands = await import('./commands.js');
    return commands[name](e);
}
