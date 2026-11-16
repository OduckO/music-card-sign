import config from '../../config/index.js';
import { updateSettings } from '../music-card-sign/service.js';
import { selectPlatform } from '../../models/music-sign.js';
import { errorMessage } from '../../utils/index.js';
const schemas = [
    { component: 'SOFT_GROUP_BEGIN', label: '音卡签名服务' },
    { field: 'enabled', label: '启用服务', component: 'Switch' },
    {
        field: 'botId',
        label: '签名 Bot',
        component: 'Input',
        bottomHelpMessage: '填写已登录的 icqq QQ 号；留空自动选择账号。'
    },
    {
        field: 'targetId',
        label: '音卡接收联系人',
        component: 'Input',
        bottomHelpMessage: '留空发给签名 Bot 自己；填写可私聊的联系人 QQ 号，签名时会向其发送音卡。'
    },
    {
        field: 'timeoutMs',
        label: '查询、回传与发送超时（毫秒）',
        component: 'InputNumber',
        componentProps: { min: 1, max: 2147483647, step: 1000 }
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
        bottomHelpMessage: '链接未识别时使用此平台；默认 txqq（QQ 本体）。可选择内置项或输入自定义名称，_platform 优先于链接识别。',
        componentProps: {
            placeholder: '选择平台或输入自定义平台名',
            filterOption: false,
            options: [
                { label: 'QQ 本体（txqq）', value: 'txqq' },
                { label: 'QQ 音乐（qq）', value: 'qq' },
                { label: '网易云音乐（netease / 163）', value: 'netease' },
                { label: '酷我音乐（kuwo）', value: 'kuwo' },
                { label: '酷狗音乐（kugou）', value: 'kugou' },
                { label: '咪咕音乐（migu）', value: 'migu' },
                { label: '哔哩哔哩（bilibili）', value: 'bilibili' },
                { label: '5sing（5sing）', value: '5sing' },
                { label: '波点音乐（bodian）', value: 'bodian' },
                { label: 'TIM（tim）', value: 'tim' },
                { label: '原神（yuanshen）', value: 'yuanshen' }
            ]
        }
    },
    {
        field: 'testMusic',
        label: '测试歌曲 JSON',
        component: 'InputTextArea',
        bottomHelpMessage: '填写完整歌曲请求或 ID 请求，供 #音之测测 使用。',
        componentProps: { rows: 8 }
    },
    {
        field: 'platforms',
        label: '自定义平台 JSON',
        component: 'InputTextArea',
        bottomHelpMessage: '平台名称到应用信息的映射；appid 必填，appname 和 appsign 可省略或为空。',
        componentProps: { rows: 8 }
    }
];
function objectValue(value, label) {
    let parsed = value;
    try {
        if (typeof parsed === 'string')
            parsed = JSON.parse(parsed);
    }
    catch {
        throw new Error(`${label} 必须是有效的 JSON 对象`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error(`${label} 必须是 JSON 对象`);
    return parsed;
}
function stringValue(value, label) {
    if (typeof value !== 'string')
        throw new Error(`${label} 必须是字符串`);
    return value;
}
function integerValue(value, label, min, max) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max)
        throw new Error(`${label} 必须是 ${min} 到 ${max} 的整数`);
    return value;
}
function configPatch(data) {
    const patch = {};
    if (Object.hasOwn(data, 'enabled')) {
        if (typeof data.enabled !== 'boolean')
            throw new Error('服务开关必须是布尔值');
        patch.enabled = data.enabled;
    }
    if (Object.hasOwn(data, 'botId')) {
        patch.botId = stringValue(data.botId, 'Bot 号').trim();
        if (patch.botId &&
            (!/^[1-9]\d*$/.test(patch.botId) || !Number.isSafeInteger(Number(patch.botId))))
            throw new Error('Bot 号必须是有效的正整数 QQ 号，或留空');
    }
    if (Object.hasOwn(data, 'targetId')) {
        patch.targetId = stringValue(data.targetId, '联系人 QQ 号').trim();
        if (patch.targetId &&
            (!/^[1-9]\d*$/.test(patch.targetId) || !Number.isSafeInteger(Number(patch.targetId))))
            throw new Error('联系人必须是有效的正整数 QQ 号，或留空');
    }
    if (Object.hasOwn(data, 'path')) {
        patch.path = stringValue(data.path, '签名路由').trim();
        if (!/^\/[\w/-]+$/.test(patch.path) || patch.path.endsWith('/'))
            throw new Error('签名路由必须以 / 开头且不带结尾斜杠');
    }
    if (Object.hasOwn(data, 'apiKey'))
        patch.apiKey = stringValue(data.apiKey, 'API Key');
    if (Object.hasOwn(data, 'localPort'))
        patch.localPort = integerValue(data.localPort, '本地端口', 0, 65535);
    if (Object.hasOwn(data, 'timeoutMs'))
        patch.timeoutMs = integerValue(data.timeoutMs, '超时', 1, 2147483647);
    if (Object.hasOwn(data, 'testMusic'))
        patch.testMusic = objectValue(data.testMusic, '测试歌曲');
    if (Object.hasOwn(data, 'defaultPlatform'))
        patch.defaultPlatform = stringValue(data.defaultPlatform, '默认签名平台').trim().toLowerCase();
    if (Object.hasOwn(data, 'platforms')) {
        const entries = objectValue(data.platforms, '平台映射');
        patch.platforms = Object.fromEntries(Object.entries(entries).map(([name, value]) => {
            if (!name.trim())
                throw new Error('平台名称不能为空');
            const platform = objectValue(value, `平台 ${name}`);
            selectPlatform({ _platform: platform }, {});
            return [name, platform];
        }));
    }
    return patch;
}
export function supportGuoba() {
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
            schemas,
            getConfigData() {
                return {
                    ...config.config,
                    platforms: JSON.stringify(config.config.platforms, null, 2),
                    testMusic: JSON.stringify(config.config.testMusic, null, 2)
                };
            },
            async setConfigData(data, { Result }) {
                try {
                    await updateSettings(configPatch(data));
                    return Result.ok({}, '保存成功，音卡服务已重新加载');
                }
                catch (error) {
                    return Result.error(errorMessage(error));
                }
            }
        }
    };
}
