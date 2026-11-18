import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Tabs } from '@heroui/react/tabs'
import { Button } from '@heroui/react/button'
import { Spinner } from '@heroui/react/spinner'
import { Icon } from '@iconify/react'
import musicNotes from '@iconify-icons/solar/music-notes-bold-duotone'
import settingsIcon from '@iconify-icons/solar/settings-bold-duotone'
import { SpiralBackdrop } from '../../ktr/template/components/SpiralBackdrop'
import { Settings } from './Settings'
import { Sign } from './Sign'
import { api, request } from './api'
import type { PanelState } from './types'
import './style.css'

void Promise.all(
  [
    ['Regular', '400'],
    ['Bold', '700']
  ].map(async ([name, weight]) => {
    const response = await request(`/fonts/${name}`)
    if (!response.ok) throw new Error(`字体加载失败（HTTP ${response.status}）`)
    const font = new FontFace('HarmonyOS Sans SC', await response.arrayBuffer(), { weight })
    document.fonts.add(await font.load())
  })
).catch((error: unknown) => console.warn('[音卡字体]', error))

const App = () => {
  const [state, setState] = useState<PanelState | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('settings')
  const load = async () => {
    setState(await api<PanelState>('/config'))
  }
  const retry = () => {
    setError('')
    void load().catch((failure: unknown) => {
      setError(failure instanceof Error ? failure.message : String(failure))
    })
  }
  useEffect(retry, [])
  return (
    <main className="panel">
      <a className="skip-link" href="#workspace">
        跳到操作区域
      </a>
      <header className="panel-topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Icon icon={musicNotes} />
          </span>
          <span>
            音乐签名<small>music-card-sign</small>
          </span>
        </div>
        <span role="status" className={`service-state ${state?.status.enabled ? 'online' : ''}`}>
          {state ? (state.status.enabled ? '签名服务已开启' : '签名服务未开启') : '正在连接服务…'}
        </span>
      </header>
      <section className="panel-heading">
        <SpiralBackdrop wide />
        <div className="heading-copy">
          <h1>{tab === 'sign' ? '请求一张音卡' : '音乐签名工作台'}</h1>
          <p>
            {tab === 'sign'
              ? '提交歌曲信息，获取可发送的完整签名 JSON。'
              : '选择签名账号、收卡联系人和默认音乐平台。'}
          </p>
        </div>
        {state && (
          <div className="service-summary">
            <div>
              <span>在线 icqq</span>
              <strong>
                {state.accounts.length ? `${state.accounts.length} 个账号` : '暂无账号'}
              </strong>
            </div>
            <div>
              <span>默认平台</span>
              <strong>{state.config.defaultPlatform}</strong>
            </div>
            <div>
              <span>等待回传</span>
              <strong>{state.status.pending} 个请求</strong>
            </div>
          </div>
        )}
      </section>
      {error ? (
        <div className="load-error">
          <h2>无法读取配置</h2>
          <p role="alert">{error}</p>
          <Button onPress={retry}>重试</Button>
        </div>
      ) : !state ? (
        <div className="loading" role="status">
          <Spinner />
          <span>读取服务配置…</span>
        </div>
      ) : (
        <Tabs
          id="workspace"
          selectedKey={tab}
          onSelectionChange={(key) => setTab(String(key))}
          className="workspace-tabs"
        >
          <Tabs.ListContainer>
            <Tabs.List aria-label="音卡工作台">
              <Tabs.Tab id="settings">
                <Icon icon={settingsIcon} aria-hidden />
                服务设置
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="sign">
                <Icon icon={musicNotes} aria-hidden />
                请求音卡
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
          <Tabs.Panel id="settings" shouldForceMount hidden={tab !== 'settings'}>
            <Settings state={state} onSaved={load} />
          </Tabs.Panel>
          <Tabs.Panel id="sign" shouldForceMount hidden={tab !== 'sign'}>
            <Sign state={state} />
          </Tabs.Panel>
        </Tabs>
      )}
      <footer className="panel-footer">
        <span>music-card-sign</span>
        <a href="https://github.com/OduckO/music-card-sign" target="_blank" rel="noreferrer">
          接口与扩展文档
        </a>
      </footer>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
