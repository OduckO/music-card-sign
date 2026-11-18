import { useEffect, useState } from 'react'
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
import saveIcon from '@iconify-icons/solar/diskette-bold-duotone'
import type { FriendList, PanelState } from './types'
import { api } from './api'
import { AccountField, Field, Section } from './components'
import { MusicEditor, PlatformEditor } from './ConfigEditors'
import {
  musicForm,
  musicFromForm,
  musicFormErrors,
  platformRows,
  platformsFromRows,
  platformRowErrors
} from '../../src/modules/music-card-sign/config-form'

export const Settings = ({
  state,
  onSaved
}: {
  state: PanelState
  onSaved: () => Promise<void>
}) => {
  const [settings, setSettings] = useState(state.config)
  const [platforms, setPlatforms] = useState(() => platformRows(settings.platforms))
  const [testMusic, setTestMusic] = useState(() => musicForm(settings.testMusic))
  const [showErrors, setShowErrors] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [clearKey, setClearKey] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null)
  const [friends, setFriends] = useState<FriendList | null>(null)
  const [friendError, setFriendError] = useState('')
  const selectedAccount = settings.botId
    ? (state.accounts.find(({ id }) => id === settings.botId)?.id ?? '')
    : state.accounts.length === 1
      ? state.accounts[0].id
      : ''
  const patch = (key: keyof typeof settings, value: string | number | boolean) =>
    setSettings((previous) => ({ ...previous, [key]: value }))
  const platformOptions = [
    ...new Set([
      ...state.platforms.filter((name) => !Object.hasOwn(state.config.platforms, name)),
      ...platforms.map(({ name }) => name.trim().toLowerCase()).filter(Boolean),
      settings.defaultPlatform,
      ...(testMusic.platform && testMusic.platform !== '__inline__' ? [testMusic.platform] : [])
    ])
  ]

  useEffect(() => {
    let active = true
    setFriendError('')
    if (selectedAccount) {
      void api<FriendList>('/friends', { botId: selectedAccount }).then(
        (result) => {
          if (active) setFriends(result)
        },
        (error: unknown) => {
          if (active) setFriendError(error instanceof Error ? error.message : String(error))
        }
      )
    }
    return () => {
      active = false
    }
  }, [selectedAccount])

  const save = async () => {
    setShowErrors(true)
    const errors = [
      ...platforms.flatMap((row) => Object.values(platformRowErrors(row, platforms))),
      ...Object.values(musicFormErrors(testMusic))
    ].filter(Boolean)
    if (errors.length) {
      setNotice({ error: true, text: `请检查平台与测试歌曲：${errors[0]}` })
      requestAnimationFrame(() =>
        document.querySelector<HTMLInputElement>('.settings-layout [aria-invalid="true"]')?.focus()
      )
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      const result = await api<{ message: string }>('/config', {
        ...settings,
        platforms: platformsFromRows(platforms, settings.platforms),
        testMusic: musicFromForm(testMusic, settings.testMusic),
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
          <AccountField
            label="签名 Bot"
            value={settings.botId}
            onChange={(v) => patch('botId', v)}
            options={state.accounts}
            placeholder="自动选择，或填写 QQ 号"
            description="从框架在线的 icqq 账号里选择；清空恢复自动选择。多个账号在线时需指定一个。"
          />
          <AccountField
            label="接收联系人"
            value={settings.targetId}
            onChange={(v) => patch('targetId', v)}
            options={selectedAccount && friends?.botId === selectedAccount ? friends.friends : []}
            placeholder="签名 Bot 自己，或填写 QQ 号"
            description={
              friendError ||
              (selectedAccount
                ? friends?.botId === selectedAccount
                  ? `可选 ${friends.friends.length} 位好友；也可手填 QQ。清空后发给签名 Bot 自己。`
                  : '正在读取该签名 Bot 的好友列表…'
                : '先选择一个在线 icqq 账号即可查看其好友；也可手填 QQ。留空发给签名 Bot 自己。')
            }
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
                {platformOptions.map((name) => (
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
        <PlatformEditor
          rows={platforms}
          onChange={setPlatforms}
          previous={settings.platforms}
          showErrors={showErrors}
        />
        <MusicEditor
          value={testMusic}
          onChange={setTestMusic}
          previous={settings.testMusic}
          platforms={platformOptions}
          showErrors={showErrors}
        />
      </div>
      <aside className="side-note">
        <h3>保存后即时生效</h3>
        <p>签名服务会按新配置重新加载。账号、路由与平台的修改会应用到后续请求。</p>
        <div className="status-list">
          <span>在线 icqq</span>
          <strong>{state.accounts.map(({ id }) => id).join('、') || '无'}</strong>
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
