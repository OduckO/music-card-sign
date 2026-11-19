import config from '@/config'
import type { CommandEvent } from '@/types'
import { helpGroups } from './help-data'
import { replyTemplate } from './render'

export const help = (e: CommandEvent) =>
  replyTemplate(
    e,
    'music/help',
    { path: config.config.path, defaultPlatform: config.config.defaultPlatform },
    [
      '音乐签名帮助',
      ...helpGroups.flatMap((group) =>
        group.commands.map(([command, description]) => `${command}：${description}`)
      ),
      `API：POST ${config.config.path}`,
      'type=custom：必填 title/url；audio、singer、image 可空。',
      '平台：显式扩展 > 标题末尾平台标记 > 跳转链接识别 > 默认配置。',
      'https://github.com/OduckO/music-card-sign'
    ].join('\n')
  )
