import config from '@/config'
import { getSigningBots, updateSettings } from '@/modules/music-card-sign/service'
import { configPatch } from '@/modules/music-card-sign/settings'
import { errorMessage } from '@/utils'
import type { Config } from '@/types'
import type { Result as GuobaResultType, Schemas, SupportGuoba } from 'trss-yunzai/guoba'

type FormConfig = Omit<Config, 'platforms' | 'testMusic'> & {
  platforms: string
  testMusic: string
  targetFriend: Array<string | number>
}

const schemas: Schemas<FormConfig> = [
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
    bottomHelpMessage:
      '选择后保存会填入接收联系人。按已保存的签名 Bot 显示好友；换账号请先保存，再重新打开配置。',
    componentProps: { isRadioSelection: true, maxSelectCount: 1 }
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
    bottomHelpMessage:
      '链接未识别时使用此平台；默认 default（appid 102021671）。可选择内置项或输入自定义名称，_platform 优先于链接识别。',
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
]

export function supportGuoba() {
  logger.info('[音卡签名] 锅巴读取插件配置')
  const bots = getSigningBots()
  const botId = config.config.botId || (bots.length === 1 ? String(bots[0].uin) : '')
  const accountSchemas = schemas.map((schema) => {
    if (schema.field === 'botId') {
      return Object.assign({}, schema, {
        componentProps: {
          placeholder: '选择在线 icqq 账号或输入 QQ',
          options: bots.map((bot) => ({
            value: String(bot.uin),
            label: bot.nickname ? `${bot.nickname}（${bot.uin}）` : String(bot.uin)
          }))
        }
      })
    }
    if (schema.field === 'targetFriend') {
      return Object.assign({}, schema, {
        componentProps: {
          ...schema.componentProps,
          params: { bot_id: botId || '0' }
        }
      })
    }
    return schema
  })
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
      schemas: accountSchemas,
      getConfigData() {
        return {
          ...config.config,
          targetFriend: [],
          platforms: JSON.stringify(config.config.platforms, null, 2),
          testMusic: JSON.stringify(config.config.testMusic, null, 2)
        }
      },
      async setConfigData(
        data: Record<string, unknown>,
        { Result }: { Result: Pick<typeof GuobaResultType, 'ok' | 'error'> }
      ) {
        try {
          const { targetFriend, ...settings } = data
          if (targetFriend !== undefined) {
            if (!Array.isArray(targetFriend) || targetFriend.length > 1)
              return Result.error('接收联系人只能选择一位好友')
            if (targetFriend.length) {
              const id: unknown = targetFriend[0]
              if (typeof id !== 'string' && typeof id !== 'number')
                return Result.error('好友 QQ 号格式错误')
              settings.targetId = String(id)
            }
          }
          await updateSettings(configPatch(settings))
          return Result.ok({}, '保存成功，音卡服务已重新加载')
        } catch (error) {
          return Result.error(errorMessage(error))
        }
      }
    }
  } satisfies SupportGuoba<FormConfig>
}
