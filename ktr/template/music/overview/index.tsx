import { defineTemplate, type TemplateProps } from '@karinjs/template-react'
import type { OverviewData } from '../../../../src/modules/music-card-sign/help-data'
import { PixelArtwork } from '../../components/PixelArtwork'

const Overview = ({ data }: TemplateProps<OverviewData>) => (
  <main className="overview-poster">
    <header className="hero">
      <PixelArtwork className="hero-art" />
      <span>music-card-sign</span>
      <h1>{data.title}</h1>
      <p>{data.message || '当前配置与服务状态'}</p>
    </header>
    <dl>
      {data.rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}：</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
    <footer>修改账号、联系人或平台的指令见 #音乐签名帮助。字体：HarmonyOS Sans SC</footer>
  </main>
)

export default defineTemplate({
  name: '音卡设置与状态',
  description: '当前服务配置与在线账号',
  component: Overview
})
