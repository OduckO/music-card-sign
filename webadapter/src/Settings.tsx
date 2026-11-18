import { useState } from 'react'
import { Button } from '@heroui/react/button'
import { Switch } from '@heroui/react/switch'
import { Spinner } from '@heroui/react/spinner'
import { Select } from '@heroui/react/select'
import { ListBox } from '@heroui/react/list-box'
import { Label } from '@heroui/react/label'
import { Description } from '@heroui/react/description'
import { Icon } from '@iconify/react'
import settingsIcon from '@iconify-icons/solar/settings-bold-duotone'
import server from '@iconify-icons/solar/server-bold-duotone'
import music from '@iconify-icons/solar/music-notes-bold-duotone'
import saveIcon from '@iconify-icons/solar/diskette-bold-duotone'
import type { PanelState } from './types'
import { api } from './api'
import { Field, Section } from './components'

export const Settings = ({
  state,
  onSaved
}: {
  state: PanelState
  onSaved: () => Promise<void>
}) => {
  const [settings, setSettings] = useState(state.config)
  const [platforms, setPlatforms] = useState(JSON.stringify(settings.platforms, null, 2))
  const [testMusic, setTestMusic] = useState(JSON.stringify(settings.testMusic, null, 2))
  const [apiKey, setApiKey] = useState('')
  const [clearKey, setClearKey] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null)
  const patch = (key: keyof typeof settings, value: string | number | boolean) =>
    setSettings((previous) => ({ ...previous, [key]: value }))

  const save = async () => {
    setBusy(true)
    setNotice(null)
    try {
      const result = await api<{ message: string }>('/config', {
        ...settings,
        platforms: JSON.parse(platforms),
        testMusic: JSON.parse(testMusic),
        ...(clearKey ? { apiKey: '' } : apiKey ? { apiKey } : {})
      })
      setApiKey('')
      setClearKey(false)
      await onSaved()
      setNotice({ error: false, text: result.message })
    } catch (error) {
      setNotice({ error: true, text: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings-layout">
      <div className="settings-sections">
        <Section
          icon={settingsIcon}
          title="签名服务"
          description="使用已登录的 icqq 账号生成音卡。"
        >
          <Switch
            isSelected={settings.enabled}
            onChange={(value) => patch('enabled', value)}
            className="switch-row wide"
          >
            <Switch.Content>
              <div className="switch-copy">
                <Label>启用音卡签名</Label>
                <Description>关闭后停止处理新的签名请求。</Description>
              </div>
              <span className="switch-state" aria-hidden>
                {settings.enabled ? '已开启' : '已关闭'}
              </span>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
          <Field
            label="签名 Bot"
            value={settings.botId}
            onChange={(v) => patch('botId', v)}
            description="QQ 号；留空自动选择。"
          />
          <Field
            label="接收联系人"
            value={settings.targetId}
            onChange={(v) => patch('targetId', v)}
            description="QQ 号；留空发给签名 Bot 自己。"
          />
          <Select
            selectedKey={settings.defaultPlatform}
            onSelectionChange={(value) => {
              if (value !== null) patch('defaultPlatform', String(value))
            }}
          >
            <Label>默认平台</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {state.platforms.map((name) => (
                  <ListBox.Item key={name} id={name} textValue={name}>
                    {name}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
          <Field
            label="超时（毫秒）"
            type="number"
            value={String(settings.timeoutMs)}
            onChange={(v) => patch('timeoutMs', Number(v))}
            description="查询、回传和协议端发送的最长等待。"
          />
        </Section>
        <Section
          icon={server}
          title="HTTP 接口"
          description="外部调用使用此路由；面板操作沿用面板登录鉴权。"
        >
          <Field
            label="签名路由"
            value={settings.path}
            onChange={(v) => patch('path', v)}
            required
          />
          <Field
            label="额外本地端口"
            type="number"
            value={String(settings.localPort)}
            onChange={(v) => patch('localPort', Number(v))}
            description="0 使用云崽现有端口。"
          />
          <Field
            label="替换 API Key"
            type="password"
            value={apiKey}
            onChange={setApiKey}
            disabled={clearKey}
            description={
              state.hasApiKey ? '已设置；留空保留原值。' : '未设置；留空不启用插件鉴权。'
            }
          />
          <Switch isSelected={clearKey} onChange={setClearKey} className="switch-row">
            <Switch.Content>
              <div className="switch-copy">
                <Label>清除 API Key</Label>
                <Description>保存时移除现有密钥。</Description>
              </div>
              <span className="switch-state" aria-hidden>
                {clearKey ? '将清除' : '保留'}
              </span>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </Section>
        <Section
          icon={music}
          title="平台与测试歌曲"
          description="自定义平台 appid 必填；appname、appsign 可省略或为空。"
        >
          <Field label="自定义平台 JSON" value={platforms} onChange={setPlatforms} multiline />
          <Field
            label="测试歌曲 JSON"
            value={testMusic}
            onChange={setTestMusic}
            multiline
            description="供 #音之测测 与请求页载入。"
          />
        </Section>
      </div>
      <aside className="side-note">
        <h3>保存后即时生效</h3>
        <p>签名服务会按新配置重新加载。账号、路由与平台的修改会应用到后续请求。</p>
        <div className="status-list">
          <span>在线 icqq</span>
          <strong>{state.status.bots.join('、') || '无'}</strong>
          <span>默认平台</span>
          <strong>{state.config.defaultPlatform}</strong>
        </div>
        <Button onPress={save} isDisabled={busy} aria-busy={busy} className="save-button">
          {busy ? <Spinner size="sm" /> : <Icon icon={saveIcon} aria-hidden />}
          {busy ? '正在保存…' : '保存设置'}
        </Button>
        {notice && (
          <p
            role={notice.error ? 'alert' : 'status'}
            className={notice.error ? 'feedback error' : 'feedback success'}
          >
            {notice.text}
          </p>
        )}
      </aside>
    </div>
  )
}
