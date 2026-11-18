import { defineTemplate, type TemplateProps } from '@karinjs/template-react'
import { Icon } from '@iconify/react'
import power from '@iconify-icons/solar/power-bold-duotone'
import user from '@iconify-icons/solar/user-rounded-bold-duotone'
import contacts from '@iconify-icons/solar/users-group-rounded-bold-duotone'
import platform from '@iconify-icons/solar/global-bold-duotone'
import pulse from '@iconify-icons/solar/pulse-2-bold-duotone'
import history from '@iconify-icons/solar/history-bold-duotone'
import code from '@iconify-icons/solar/code-square-bold-duotone'
import server from '@iconify-icons/solar/server-bold-duotone'
import clock from '@iconify-icons/solar/clock-circle-bold-duotone'
import key from '@iconify-icons/solar/key-bold-duotone'
import chevron from '@iconify-icons/solar/alt-arrow-down-linear'
import settings from '@iconify-icons/solar/settings-bold-duotone'
import type { OverviewData } from '../../../../src/modules/music-card-sign/help-data'

const fields = {
  音卡签名服务: { icon: power, style: 'toggle' },
  '签名 Bot': { icon: user, style: 'field' },
  接收联系人: { icon: contacts, style: 'field' },
  默认签名平台: { icon: platform, style: 'select' },
  '在线 icqq': { icon: pulse, style: 'status' },
  等待请求: { icon: history, style: 'count' },
  宿主路径: { icon: code, style: 'field' },
  本地端口: { icon: server, style: 'field' },
  回传超时: { icon: clock, style: 'field' },
  'API Key': { icon: key, style: 'status' }
}

const Overview = ({ data }: TemplateProps<OverviewData>) => (
  <main className="overview-poster">
    <header className="hero">
      <Icon
        icon={data.title === '音卡设置' ? settings : pulse}
        ssr
        aria-hidden
        className="overview-emblem"
      />
      <h1>{data.title}</h1>
      <p>{data.message || '当前配置与服务状态'}</p>
    </header>
    <dl>
      {data.rows.map(([label, value]) => (
        <div key={label} className="overview-item">
          <dt>
            <Icon icon={fields[label].icon} ssr aria-hidden />
            {label}
          </dt>
          <dd
            className={`snapshot-${fields[label].style}`}
            data-empty={value === '无' || value === '未设置'}
          >
            {label === '音卡签名服务' && (
              <span className="snapshot-switch" data-on={value === '开启'} aria-hidden>
                <span />
              </span>
            )}
            <span>{value}</span>
            {label === '等待请求' && <small>个</small>}
            {label === '默认签名平台' && <Icon icon={chevron} ssr aria-hidden />}
          </dd>
        </div>
      ))}
    </dl>
    <footer>这是当前配置快照。修改设置请打开管理面板，或发送 #音乐签名帮助。</footer>
  </main>
)

export default defineTemplate({
  name: '音卡设置与状态',
  description: '当前服务配置与在线账号',
  component: Overview
})
