import config from '@/config'
import type { CommandEvent } from '@/types'
import { getServiceStatus, getSigningBots } from './service'
import { replyTemplate } from './render'
import type { OverviewData } from './help-data'

export async function overview(e: CommandEvent, message?: string) {
  if (message && /^(设置|切换)失败/.test(message)) {
    await e.reply(message)
    return true
  }
  const status = await getServiceStatus()
  const settings = config.config
  const data: OverviewData = {
    title: '音卡状态',
    message,
    rows: [
      ['音卡签名服务', status?.enabled ? '开启' : '关闭'],
      ['签名 Bot', settings.botId || '自动选择'],
      ['接收联系人', settings.targetId || '签名 Bot 自己'],
      ['默认签名平台', settings.defaultPlatform],
      [
        '在线 icqq',
        getSigningBots()
          .map((bot) => bot.uin)
          .join('、') || '无'
      ],
      ['等待请求', String(status?.pending || 0)],
      ['宿主路径', settings.path],
      ['本地端口', settings.localPort ? String(settings.localPort) : '使用云崽现有 HTTP 端口'],
      ['回传超时', `${settings.timeoutMs / 1000} 秒`],
      ['API Key', settings.apiKey ? '已设置' : '未设置']
    ]
  }
  return replyTemplate(
    e,
    'music/overview',
    data,
    [message || data.title, ...data.rows.map(([label, value]) => `${label}  ${value}`)].join('\n')
  )
}
