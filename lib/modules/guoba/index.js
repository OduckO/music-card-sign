import config from '../../config/index.js';
import { getCommandBots, getSigningBots, updateSettings } from '../music-card-sign/service.js';
import { configPatch } from '../music-card-sign/settings.js';
import { errorMessage } from '../../utils/index.js';
import { commandBotModes, musicForm, platformRows } from '../music-card-sign/config-form.js';
import { applyFormData, editorSchemas } from './forms.js';
const builtinPlatforms = [
    { label: '默认应用（default，appid 102021671）', value: 'default' },
    { label: 'QQ 音乐（qq）', value: 'qq' },
    { label: '网易云音乐（netease / 163）', value: 'netease' },
    { label: '酷我音乐（kuwo）', value: 'kuwo' },
    { label: '酷狗音乐（kugou）', value: 'kugou' },
    { label: '酷狗概念版（kugou_concept）', value: 'kugou_concept' },
    { label: '咪咕音乐（migu）', value: 'migu' },
    { label: '哔哩哔哩（bilibili）', value: 'bilibili' },
    { label: '5sing（5sing）', value: '5sing' },
    { label: '波点音乐（bodian）', value: 'bodian' },
    { label: 'TIM（tim）', value: 'tim' },
    { label: '原神（yuanshen）', value: 'yuanshen' }
];
const schemas = [
    { component: 'SOFT_GROUP_BEGIN', label: '音卡签名服务' },
    { field: 'enabled', label: '启用服务', component: 'Switch' },
    {
        field: 'botId',
        label: '签名 Bot',
        component: 'AutoComplete',
        bottomHelpMessage: '选择在线 icqq 账号，也可填写 QQ；留空自动选择，多个账号在线时需指定一个。'
    },
    {
        field: 'targetId',
        label: '音卡接收联系人',
        component: 'Input',
        bottomHelpMessage: '留空发给签名 Bot 自己；填写可私聊的联系人 QQ 号，签名时会向其发送音卡。'
    },
    {
        field: 'targetFriend',
        label: '从好友中选择联系人',
        component: 'GSelectFriend',
        bottomHelpMessage: '选择后保存会填入接收联系人。按已保存的签名 Bot 显示好友；换账号请先保存，再重新打开配置。',
        componentProps: { isRadioSelection: true, maxSelectCount: 1 }
    },
    {
        field: 'timeoutMs',
        label: '查询、回传与发送超时（毫秒）',
        component: 'InputNumber',
        componentProps: { min: 1, max: 2147483647, step: 1000 }
    },
    { component: 'SOFT_GROUP_BEGIN', label: '聊天指令响应' },
    {
        field: 'commandBotMode',
        label: '响应模式',
        component: 'Select',
        componentProps: { options: commandBotModes },
        bottomHelpMessage: commandBotModes.map(({ label, description }) => `${label}：${description}`).join('\n') +
            '\n只控制接收指令的 Bot，不影响签名账号、HTTP 或 Handler。两份名单分别保存，只有当前模式生效。被拦截的指令会在日志中提示调整名单或关闭限制。'
    },
    {
        field: 'commandBotBlacklist',
        label: '黑名单 Bot',
        component: 'Select',
        componentProps: {
            mode: 'multiple',
            showSearch: true,
            optionFilterProp: 'label',
            placeholder: '按昵称或 QQ 选择需要保持静默的 Bot'
        },
        bottomHelpMessage: '从框架在线 Bot 中多选，仅黑名单模式使用。选中的 Bot 不执行也不回复本插件任何聊天指令，包括帮助。'
    },
    {
        field: 'commandBotWhitelist',
        label: '白名单 Bot（空名单会全部静默）',
        component: 'Select',
        componentProps: {
            mode: 'multiple',
            showSearch: true,
            optionFilterProp: 'label',
            placeholder: '按昵称或 QQ 选择允许响应的 Bot'
        },
        bottomHelpMessage: '特别注意：启用白名单但未选择任何 Bot，会让本插件全部聊天指令静默，包括帮助和设置指令。请先选择允许响应的 Bot；若已无法通过指令操作，请在锅巴或 WebUI 将响应模式设为「关闭限制」。HTTP 和 Handler 签名仍可使用。'
    },
    { component: 'SOFT_GROUP_BEGIN', label: 'HTTP 接口' },
    { field: 'path', label: '签名路由', component: 'Input' },
    {
        field: 'localPort',
        label: '额外本地端口',
        component: 'InputNumber',
        bottomHelpMessage: '0 使用云崽 HTTP 服务；例如 4567 会额外监听本机端口。',
        componentProps: { min: 0, max: 65535, precision: 0 }
    },
    {
        field: 'apiKey',
        label: '插件 API Key',
        component: 'InputPassword',
        bottomHelpMessage: '留空不启用插件鉴权，宿主鉴权仍按云崽配置执行。'
    },
    { component: 'SOFT_GROUP_BEGIN', label: '测试与平台扩展' },
    {
        field: 'defaultPlatform',
        label: '默认签名平台',
        component: 'AutoComplete',
        bottomHelpMessage: '链接未识别时使用此平台；默认 default（appid 102021671）。可选择内置项或输入自定义名称，_platform 优先于链接识别。',
        componentProps: {
            placeholder: '选择平台或输入自定义平台名',
            filterOption: false
        }
    }
];
export function supportGuoba() {
    logger.info('[音卡签名] 锅巴读取插件配置');
    const bots = getSigningBots();
    const botId = config.config.botId || (bots.length === 1 ? String(bots[0].uin) : '');
    const platformOptions = [
        ...builtinPlatforms,
        ...Object.keys(config.config.platforms).map((name) => ({ label: name, value: name }))
    ].filter((option, index, all) => all.findIndex(({ value }) => value === option.value) === index);
    const accountSchemas = schemas.map((schema) => {
        if (schema.field === 'commandBotBlacklist' || schema.field === 'commandBotWhitelist') {
            const field = schema.field;
            return Object.assign({}, schema, {
                componentProps: {
                    ...schema.componentProps,
                    get options() {
                        const commandBots = getCommandBots();
                        return [
                            ...commandBots.map(({ id, name }) => ({ value: id, label: `${name}（${id}）` })),
                            ...config.config[field]
                                .filter((id) => !commandBots.some((bot) => bot.id === id))
                                .map((id) => ({ value: id, label: `${id}（当前不在线）` }))
                        ];
                    }
                }
            });
        }
        if (schema.field === 'defaultPlatform') {
            return Object.assign({}, schema, {
                componentProps: { ...schema.componentProps, options: platformOptions }
            });
        }
        if (schema.field === 'botId') {
            return Object.assign({}, schema, {
                componentProps: {
                    placeholder: '选择在线 icqq 账号或输入 QQ',
                    options: bots.map((bot) => ({
                        value: String(bot.uin),
                        label: bot.nickname ? `${bot.nickname}（${bot.uin}）` : String(bot.uin)
                    }))
                }
            });
        }
        if (schema.field === 'targetFriend') {
            return Object.assign({}, schema, {
                componentProps: {
                    ...schema.componentProps,
                    params: { bot_id: botId || '0' }
                }
            });
        }
        return schema;
    });
    return {
        pluginInfo: {
            name: 'music-card-sign',
            title: '本地 icqq 音卡签名',
            description: '复用云崽 icqq 账号生成音卡，支持精确缓存和自定义平台。',
            author: '@OduckO',
            authorLink: 'https://github.com/OduckO',
            link: 'https://github.com/OduckO/music-card-sign',
            isV3: true,
            isV2: false,
            showInMenu: 'auto',
            icon: 'mdi:music-box'
        },
        configInfo: {
            schemas: [...accountSchemas, ...editorSchemas(platformOptions)],
            getConfigData() {
                return {
                    ...config.config,
                    targetFriend: [],
                    platformEntries: platformRows(config.config.platforms),
                    testSong: musicForm(config.config.testMusic),
                    platforms: JSON.stringify(config.config.platforms, null, 2),
                    testMusic: JSON.stringify(config.config.testMusic, null, 2)
                };
            },
            async setConfigData(data, { Result }) {
                try {
                    const { targetFriend, ...values } = data;
                    const settings = applyFormData(values, config.config);
                    if (targetFriend !== undefined) {
                        if (!Array.isArray(targetFriend) || targetFriend.length > 1)
                            return Result.error('接收联系人只能选择一位好友');
                        if (targetFriend.length) {
                            const id = targetFriend[0];
                            if (typeof id !== 'string' && typeof id !== 'number')
                                return Result.error('好友 QQ 号格式错误');
                            settings.targetId = String(id);
                        }
                    }
                    await updateSettings(configPatch(settings));
                    return Result.ok({}, '保存成功，设置已生效');
                }
                catch (error) {
                    return Result.error(errorMessage(error));
                }
            }
        }
    };
}
