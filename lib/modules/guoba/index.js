import config from '../../config/index.js';
import { updateSettings } from '../music-card-sign/service.js';
import { configPatch } from '../music-card-sign/settings.js';
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
        bottomHelpMessage: '链接未识别时使用此平台；默认 default（appid 102021671）。可选择内置项或输入自定义名称，_platform 优先于链接识别。',
        componentProps: {
            placeholder: '选择平台或输入自定义平台名',
            filterOption: false,
            options: [
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
export function supportGuoba() {
    logger.info('[音卡签名] 锅巴读取插件配置');
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
