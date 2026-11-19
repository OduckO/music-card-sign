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
  commandBotModes,
  musicForm,
  musicFromForm,
  musicFormErrors,
  platformRows,
  platformsFromRows,
  platformRowErrors
} from '../../src/modules/music-card-sign/config-form'

export const Settings = ({
  state,
  onSaved,
  busy,
  setBusy
}: {
  state: PanelState
  onSaved: () => Promise<void>
  busy: boolean
  setBusy: (value: boolean) => void
}) => {
  const [changes, setChanges] = useState<Partial<PanelState['config']>>({})
  const settings = { ...state.config, ...changes }
  const [platforms, setPlatforms] = useState(() => platformRows(settings.platforms))
  const [testMusic, setTestMusic] = useState(() => musicForm(settings.testMusic))
  const [showErrors, setShowErrors] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [clearKey, setClearKey] = useState(false)
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null)
  const [friends, setFriends] = useState<FriendList | null>(null)
  const [friendError, setFriendError] = useState('')
  const selectedAccount = settings.botId
    ? (state.accounts.find(({ id }) => id === settings.botId)?.id ?? '')
    : state.accounts.length === 1
      ? state.accounts[0].id
      : ''
  const patch = <Key extends keyof typeof settings>(key: Key, value: (typeof settings)[Key]) =>
    setChanges((previous) => ({ ...previous, [key]: value }))
  const commandBots = [
    ...state.commandBots,
    ...[...new Set([...settings.commandBotBlacklist, ...settings.commandBotWhitelist])]
      .filter((id) => !state.commandBots.some((bot) => bot.id === id))
      .map((id) => ({ id, name: '当前不在线' }))
  ]
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
        ...changes,
        platforms: platformsFromRows(platforms, settings.platforms),
        testMusic: musicFromForm(testMusic, settings.testMusic),
        ...(clearKey ? { apiKey: '' } : apiKey ? { apiKey } : {})
      })
      setApiKey('')
      setClearKey(false)
      await onSaved()
      setChanges({})
      setNotice({ error: false, text: result.message })
    } catch (error) {
      setNotice({ error: true, text: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(false)
    }
  }

  const saveButton = (
    <Button
      type="submit"
      variant="secondary"
      isDisabled={busy}
      aria-busy={busy}
      className="save-button"
    >
      {busy ? <Spinner size="sm" /> : <Icon icon={saveIcon} aria-hidden />}
      {busy ? '正在保存…' : '保存设置'}
    </Button>
  )

  return (
    <form
      id="music-card-settings"
      className="settings-layout"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <div className="settings-sections" inert={busy}>
        <Section
          icon={settingsIcon}
          title="签名服务"
          description="使用已登录的 icqq 账号生成音卡。"
          action={saveButton}
        >
          <Switch
            isSelected={settings.enabled}
            onChange={(value) => patch('enabled', value)}
            className="switch-row wide"
          >
            <Switch.Content>
              <div className="switch-copy">
                <Label>启用音卡签名</Label>
                <Description>保存后生效；关闭后停止处理新的签名请求。</Description>
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
          icon={settingsIcon}
          title="聊天指令响应"
          description="只控制接收指令的 Bot。签名账号、HTTP 和 Handler 不受名单影响。"
          action={saveButton}
        >
          <Select
            className="wide"
            selectedKey={settings.commandBotMode}
            onSelectionChange={(key) => {
              const mode = commandBotModes.find(({ value }) => value === key)
              if (mode) patch('commandBotMode', mode.value)
            }}
          >
            <Label>响应模式</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {commandBotModes.map(({ label, value }) => (
                  <ListBox.Item key={value} id={value} textValue={label}>
                    {label}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
            <Description>
              {commandBotModes.find(({ value }) => value === settings.commandBotMode)?.description}
            </Description>
          </Select>
          {(
            [
              ['blacklist', 'commandBotBlacklist', '黑名单 Bot', '选中的 Bot 全部静默。'],
              ['whitelist', 'commandBotWhitelist', '白名单 Bot', '只有选中的 Bot 可响应。']
            ] as const
          )
            .filter(([mode]) => mode === settings.commandBotMode)
            .map(([, field, label, description]) => (
              <Select
                key={field}
                selectionMode="multiple"
                value={settings[field]}
                onChange={(keys) => patch(field, keys.map(String))}
                placeholder="从在线 Bot 中多选"
              >
                <Label>{label}</Label>
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox renderEmptyState={() => '暂无在线 Bot'}>
                    {commandBots.map(({ id, name }) => (
                      <ListBox.Item key={id} id={id} textValue={`${name}（${id}）`}>
                        {name}（{id}）
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
                <Description>{description}切换模式会保留两份名单。</Description>
              </Select>
            ))}
          {settings.commandBotMode === 'whitelist' && !settings.commandBotWhitelist.length && (
            <p role="alert" className="feedback error wide">
              白名单为空：保存后本插件全部聊天指令都会静默，包括帮助与设置指令。 请先选择允许响应的
              Bot，或将响应模式设为「关闭限制」。触发指令时，日志也会提示恢复方法。
            </p>
          )}
        </Section>
        <Section
          icon={server}
          title="HTTP 接口"
          description="外部调用使用此路由；面板操作沿用面板登录鉴权。"
          action={saveButton}
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
          action={saveButton}
        />
        <MusicEditor
          value={testMusic}
          onChange={setTestMusic}
          previous={settings.testMusic}
          platforms={platformOptions}
          showErrors={showErrors}
          action={saveButton}
        />
      </div>
      <aside className="settings-savebar" aria-label="设置保存">
        <div className="save-copy">
          <strong>保存后即时生效</strong>
          <p
            role={notice?.error ? 'alert' : 'status'}
            className={`save-feedback${notice ? (notice.error ? ' error' : ' success') : ''}`}
          >
            {notice?.text || '保存整页修改；名单不影响签名服务开关。'}
          </p>
        </div>
        <Button type="submit" isDisabled={busy} aria-busy={busy} className="save-button">
          {busy ? <Spinner size="sm" /> : <Icon icon={saveIcon} aria-hidden />}
          {busy ? '正在保存…' : '保存设置'}
        </Button>
      </aside>
    </form>
  )
}
