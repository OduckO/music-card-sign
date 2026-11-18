import { defineTemplate, type TemplateProps } from '@karinjs/template-react'
import { Icon, type IconifyIcon } from '@iconify/react'
import play from '@iconify-icons/solar/play-circle-bold-duotone'
import code from '@iconify-icons/solar/code-square-bold-duotone'
import send from '@iconify-icons/solar/card-send-bold-duotone'
import pulse from '@iconify-icons/solar/pulse-2-bold-duotone'
import settings from '@iconify-icons/solar/settings-bold-duotone'
import user from '@iconify-icons/solar/user-rounded-bold-duotone'
import contacts from '@iconify-icons/solar/users-group-rounded-bold-duotone'
import platform from '@iconify-icons/solar/global-bold-duotone'
import power from '@iconify-icons/solar/power-bold-duotone'
import refresh from '@iconify-icons/solar/refresh-bold-duotone'
import restart from '@iconify-icons/solar/restart-bold-duotone'
import history from '@iconify-icons/solar/history-bold-duotone'
import { helpGroups, type HelpData } from '../../../../src/modules/music-card-sign/help-data'

const commandIcons = {
  '#音之测测': play,
  '#音之测测 {请求JSON}': code,
  '#签名音卡 {请求JSON}': send,
  '#音乐签名状态': pulse,
  '#音乐签名设置': settings,
  '#设置音乐签名Bot <QQ号>': user,
  '#设置音乐签名联系人 <QQ号>': contacts,
  '#设置音乐签名平台 <平台名>': platform,
  '#开启音乐签名服务 / #关闭音乐签名服务': power,
  '#音乐签名更新': refresh,
  '#音乐签名强制更新': restart,
  '#音乐签名更新日志': history
} satisfies Record<(typeof helpGroups)[number]['commands'][number][0], IconifyIcon>

const Help = ({ data }: TemplateProps<HelpData>) => (
  <main className="help-poster">
    <header className="hero">
      <div className="masthead">
        <span>music-card-sign</span>
        <span>以下指令仅主人可用</span>
      </div>
      <h1>
        音乐签名
        <br />
        使用帮助
      </h1>
      <p className="hero-caption">先用 #音之测测 检查签名与发卡。</p>
    </header>
    <div className="menu">
      {helpGroups.map((group) => (
        <section key={group.title} className="menu-group">
          <div className="group-heading">
            <h2>{group.title}</h2>
            <p>{group.subtitle}</p>
          </div>
          <div className="command-list">
            {group.commands.map(([command, description]) => (
              <div className="command" key={command}>
                <Icon icon={commandIcons[command]} ssr aria-hidden className="command-icon" />
                <div>
                  <code>{command}</code>
                  <p>{description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      <section className="api-note">
        <div className="api-heading">
          <Icon icon={code} ssr aria-hidden />
          <code>POST {data.path}</code>
        </div>
        <p>自定义歌曲必填 title / url；audio、singer、image 可空。</p>
        <p>显式扩展 → 标题平台标记 → 跳转链接识别 → 默认平台</p>
        <p className="current-platform">当前默认：{data.defaultPlatform}</p>
      </section>
      <footer>
        <span>接口与 ID 扩展文档：github.com/OduckO/music-card-sign</span>
      </footer>
    </div>
  </main>
)

export default defineTemplate({
  name: '音乐签名帮助',
  description: '主人指令、签名服务设置与 API 说明',
  component: Help
})
