import { useState } from 'react'
import { Button } from '@heroui/react/button'
import { Switch } from '@heroui/react/switch'
import { Label } from '@heroui/react/label'
import { Spinner } from '@heroui/react/spinner'
import { Card } from '@heroui/react/card'
import type { MusicRequest } from '../src/types'
import type { PanelState, SignResult } from './types'
import { Field, Section } from './components'
import { api } from './api'

export const Sign = ({ state }: { state: PanelState }) => {
  const [request, setRequest] = useState(JSON.stringify(state.config.testMusic, null, 2))
  const [forceFresh, setForceFresh] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<SignResult | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const submit = async () => {
    setBusy(true)
    setError('')
    setResult(null)
    setCopied(false)
    try {
      const data: MusicRequest = JSON.parse(request)
      setResult(await api<SignResult>('/sign', { request: data, forceFresh }))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }
  const music = result?.card.meta.music
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result!.raw)
      setCopied(true)
    } catch {
      setError('复制失败，请在下方选中 JSON 后手动复制')
    }
  }
  return (
    <div className="request-layout">
      <div>
        <Section
          title="歌曲请求"
          description="支持自定义歌曲、ID 查询和扩展平台。返回完整签名 JSON。"
        >
          <Field label="请求 JSON" value={request} onChange={setRequest} multiline />
          <div className="request-actions wide">
            <Button
              variant="secondary"
              onPress={() => setRequest(JSON.stringify(state.config.testMusic, null, 2))}
            >
              载入测试歌曲
            </Button>
            <Switch isSelected={forceFresh} onChange={setForceFresh}>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              <Switch.Content>
                <Label>强制重新签名</Label>
              </Switch.Content>
            </Switch>
          </div>
          <Button className="wide" onPress={submit} isDisabled={busy || !state.status.enabled}>
            {busy && <Spinner size="sm" />}
            {busy ? '正在签名，等待音卡回传' : '请求音卡'}
          </Button>
        </Section>
        <div className="request-hints">
          <p>
            <strong>custom</strong> · title / url 必填；audio、singer、image 可空。
          </p>
          <p>
            <strong>ID 模式</strong> · 提供 type 和 id，由内置或注册的解析器查询。
          </p>
          <p>
            <strong>平台</strong> · _platform 优先；标题末尾标记其次，再识别跳转链接。
          </p>
          <p>
            <strong>缓存</strong> · 完全相同的请求会复用已签名音卡。
          </p>
        </div>
        {!state.status.enabled && (
          <p role="status" className="feedback error">
            签名服务未开启，请先到设置页启用。
          </p>
        )}
        {error && (
          <p role="alert" className="feedback error">
            {error}
          </p>
        )}
      </div>
      <Card className="result-card">
        <Card.Header>
          <Card.Title>签名结果</Card.Title>
          <Card.Description>JSON 可交给支持音卡的适配器发送。</Card.Description>
        </Card.Header>
        <Card.Content>
          {result ? (
            <>
              <div className="music-preview">
                <div className="record-art" aria-hidden="true">
                  <span />
                </div>
                <div>
                  <h3>{String(music?.title ?? '音卡')}</h3>
                  <p>{String(music?.desc ?? '')}</p>
                  <span>
                    APPID {String(music?.appid ?? '')} · {result.elapsedMs} ms
                  </span>
                </div>
              </div>
              <div className="result-toolbar">
                <span>原始 JSON</span>
                <Button size="sm" variant="secondary" onPress={copy}>
                  {copied ? '已复制' : '复制 JSON'}
                </Button>
              </div>
              <pre tabIndex={0} aria-label="完整签名 JSON">
                {result.raw}
              </pre>
            </>
          ) : (
            <div className="result-empty">
              <div className="record-art" aria-hidden="true">
                <span />
              </div>
              <h3>{busy ? '正在等待回传' : '暂无签名结果'}</h3>
              <p>
                {busy
                  ? '收到音卡或提交错误后返回结果。'
                  : '提交歌曲请求后，完整 JSON 会显示在这里。'}
              </p>
            </div>
          )}
        </Card.Content>
      </Card>
    </div>
  )
}
