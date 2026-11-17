import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Tabs } from '@heroui/react/tabs'
import { Button } from '@heroui/react/button'
import { Spinner } from '@heroui/react/spinner'
import { Settings } from './Settings'
import { Sign } from './Sign'
import { PixelArtwork } from '../ktr/template/components/PixelArtwork'
import { api } from './api'
import type { PanelState } from './types'
import './style.css'

const App = () => {
  const [state, setState] = useState<PanelState | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState(location.pathname.endsWith('sign.html') ? 'sign' : 'settings')
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
      <header className="panel-topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ♫
          </span>
          <span>
            音乐签名<small>music-card-sign</small>
          </span>
        </div>
        <span className={`service-state ${state?.status.enabled ? 'online' : ''}`}>
          {state ? (state.status.enabled ? '签名服务已开启' : '签名服务未开启') : '正在连接服务'}
        </span>
      </header>
      <section className="panel-heading">
        <PixelArtwork className="panel-art" />
        <div className="heading-copy">
          <h1>{tab === 'sign' ? '请求一张音卡' : '音乐签名工作台'}</h1>
          <p>
            {tab === 'sign'
              ? '提交歌曲信息，获取可发送的完整签名 JSON。'
              : '选择签名账号与音乐平台，让每次分享都有完整的音卡。'}
          </p>
          <span className="heading-detail">
            {tab === 'sign'
              ? '支持歌曲 ID、自定义信息与扩展平台'
              : '服务设置与音卡调试，集中在这里'}
          </span>
        </div>
        {state && (
          <div className="service-summary">
            <div>
              <span>在线 icqq</span>
              <strong>
                {state.status.bots.length ? `${state.status.bots.length} 个账号` : '暂无账号'}
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
          <span>读取服务配置</span>
        </div>
      ) : (
        <Tabs
          selectedKey={tab}
          onSelectionChange={(key) => setTab(String(key))}
          className="workspace-tabs"
        >
          <Tabs.ListContainer>
            <Tabs.List aria-label="音卡工作台">
              <Tabs.Tab id="settings">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 7h16M4 17h16M9 4v6M15 14v6" />
                </svg>
                服务设置
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="sign">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 17V5l11-2v12M9 9l11-2" />
                  <ellipse cx="6" cy="17" rx="3" ry="2" />
                  <ellipse cx="17" cy="15" rx="3" ry="2" />
                </svg>
                请求音卡
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
          <Tabs.Panel id="settings">
            <Settings state={state} onSaved={load} />
          </Tabs.Panel>
          <Tabs.Panel id="sign">
            <Sign state={state} />
          </Tabs.Panel>
        </Tabs>
      )}
      <footer className="panel-footer">
        music-card-sign{' '}
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
