import { Card } from '@heroui/react/card'
import { defineTemplate, type TemplateProps } from '@karinjs/template-react'
import { helpGroups, type HelpData } from '../../../../src/modules/music-card-sign/help-data'
import { PixelArtwork } from '../../components/PixelArtwork'

const Help = ({ data }: TemplateProps<HelpData>) => (
  <main className="help-poster bg-background text-foreground">
    <header className="hero">
      <PixelArtwork className="hero-art" />
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
        <Card key={group.title} className="menu-card">
          <Card.Header className="group-heading">
            <Card.Title>{group.title}</Card.Title>
            <Card.Description>{group.subtitle}</Card.Description>
          </Card.Header>
          <Card.Content className="command-list">
            {group.commands.map(([command, description]) => (
              <div className="command" key={command}>
                <code>{command}</code>
                <p>{description}</p>
              </div>
            ))}
          </Card.Content>
        </Card>
      ))}
      <section className="api-note">
        <div className="api-heading">
          <code>POST {data.path}</code>
        </div>
        <p>自定义歌曲必填 title / url；audio、singer、image 可空。</p>
        <p>显式扩展 → 标题平台标记 → 跳转链接识别 → 默认平台</p>
        <p className="current-platform">当前默认：{data.defaultPlatform}</p>
      </section>
      <footer>
        <span>接口与 ID 扩展文档：github.com/OduckO/music-card-sign</span>
        <br />
        <span>字体：HarmonyOS Sans SC</span>
      </footer>
    </div>
  </main>
)

export default defineTemplate({
  name: '音乐签名帮助',
  description: '主人指令、签名服务设置与 API 说明',
  component: Help
})
