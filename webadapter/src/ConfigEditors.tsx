import { useState, type ReactNode } from 'react'
import { Button } from '@heroui/react/button'
import { Select } from '@heroui/react/select'
import { ListBox } from '@heroui/react/list-box'
import { Label } from '@heroui/react/label'
import { Description } from '@heroui/react/description'
import { Icon } from '@iconify/react'
import add from '@iconify-icons/solar/add-circle-linear'
import trash from '@iconify-icons/solar/trash-bin-trash-linear'
import copy from '@iconify-icons/solar/copy-linear'
import music from '@iconify-icons/solar/music-notes-bold-duotone'
import layers from '@iconify-icons/solar/layers-bold-duotone'
import { Field, Section } from './components'
import {
  musicFromForm,
  musicFormErrors,
  musicSourceOptions,
  platformsFromRows,
  platformRowErrors,
  type MusicForm,
  type PlatformRow
} from '../../src/modules/music-card-sign/config-form'
import type { MusicRequest, PlatformInput } from '../../src/types'

const JsonPreview = ({ value, label }: { value: unknown; label: string }) => {
  const text = JSON.stringify(value, null, 2)
  const [copied, setCopied] = useState('')
  const [error, setError] = useState(false)
  return (
    <div className="json-preview wide">
      <div className="editor-toolbar">
        <span>{label}</span>
        <Button
          variant="tertiary"
          onPress={async () => {
            try {
              await navigator.clipboard.writeText(text)
              setCopied(text)
              setError(false)
            } catch {
              setError(true)
            }
          }}
          aria-label={`复制${label}`}
        >
          <Icon icon={copy} aria-hidden />
          {copied === text ? '已复制' : '复制'}
        </Button>
      </div>
      <pre tabIndex={0} aria-label={label}>
        <code>{text}</code>
      </pre>
      {error && (
        <p role="alert" className="feedback error">
          复制失败，可选中上方 JSON 手动复制。
        </p>
      )}
    </div>
  )
}

export const PlatformEditor = ({
  rows,
  onChange,
  previous,
  showErrors,
  action
}: {
  rows: PlatformRow[]
  onChange: (rows: PlatformRow[]) => void
  previous: Record<string, PlatformInput>
  showErrors: boolean
  action?: ReactNode
}) => (
  <Section
    icon={layers}
    title="自定义平台"
    description="每个平台填写三项应用信息；只有 appid 必填。"
    action={action}
  >
    <div className="platform-entries wide">
      {rows.map((row, index) => {
        const errors = showErrors ? platformRowErrors(row, rows) : { name: '', appid: '' }
        const update = (key: keyof PlatformRow, value: string) =>
          onChange(rows.map((item, at) => (at === index ? { ...item, [key]: value } : item)))
        return (
          <fieldset className="platform-entry" key={row.originalName ?? index}>
            <legend>{row.name || '新平台'}</legend>
            <div className="editor-toolbar">
              <span className="editor-hint">名称用于默认平台与请求中的 _platform</span>
              <Button
                variant="tertiary"
                aria-label={`删除平台 ${row.name || index + 1}`}
                onPress={() => onChange(rows.filter((_, at) => at !== index))}
              >
                <Icon icon={trash} aria-hidden />
                删除
              </Button>
            </div>
            <div className="fields">
              <Field
                label="平台名称"
                value={row.name}
                onChange={(v) => update('name', v)}
                required
                error={errors.name}
              />
              <Field
                label="应用 ID · appid"
                type="number"
                value={String(row.appid ?? '')}
                onChange={(v) => update('appid', v)}
                required
                error={errors.appid}
              />
              <Field
                label="包名 · appname"
                value={row.appname ?? ''}
                onChange={(v) => update('appname', v)}
                description="选填，留空不写入 JSON。"
              />
              <Field
                label="签名 · appsign"
                value={row.appsign ?? ''}
                onChange={(v) => update('appsign', v)}
                description="选填，留空不写入 JSON。"
              />
            </div>
          </fieldset>
        )
      })}
      {!rows.length && <p className="editor-empty">还没有自定义平台。使用内置平台时，无需添加。</p>}
      <Button
        variant="secondary"
        className="add-platform"
        onPress={() => onChange([...rows, { name: '', appid: '', appname: '', appsign: '' }])}
      >
        <Icon icon={add} aria-hidden />
        添加平台
      </Button>
    </div>
    <JsonPreview label="平台 JSON" value={platformsFromRows(rows, previous)} />
  </Section>
)

export const MusicEditor = ({
  value,
  onChange,
  previous,
  platforms,
  showErrors,
  action
}: {
  value: MusicForm
  onChange: (value: MusicForm) => void
  previous: MusicRequest
  platforms: string[]
  showErrors: boolean
  action?: ReactNode
}) => {
  const update = (key: keyof MusicForm, next: string) => onChange({ ...value, [key]: next })
  const errors = showErrors ? musicFormErrors(value) : {}
  const customSource = !musicSourceOptions.some((item) => item.value === value.type)
  return (
    <Section
      icon={music}
      title="测试歌曲"
      description="供 #音之测测 使用，也可在请求页载入。"
      action={action}
    >
      <Select
        selectedKey={value.mode}
        onSelectionChange={(key) => {
          if (key === 'custom' || key === 'id') update('mode', key)
        }}
      >
        <Label>填写方式</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            <ListBox.Item id="custom" textValue="歌曲信息">
              歌曲信息
              <ListBox.ItemIndicator />
            </ListBox.Item>
            <ListBox.Item id="id" textValue="歌曲 ID">
              歌曲 ID
              <ListBox.ItemIndicator />
            </ListBox.Item>
          </ListBox>
        </Select.Popover>
      </Select>
      <Select
        selectedKey={value.platform || '__auto__'}
        onSelectionChange={(key) => {
          if (key !== null) update('platform', key === '__auto__' ? '' : String(key))
        }}
      >
        <Label>签名平台</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            <ListBox.Item id="__auto__" textValue="自动识别">
              自动识别
              <ListBox.ItemIndicator />
            </ListBox.Item>
            {typeof (previous._platform ?? previous.platform) === 'object' && (
              <ListBox.Item id="__inline__" textValue="已有扩展平台">
                已有扩展平台
                <ListBox.ItemIndicator />
              </ListBox.Item>
            )}
            {platforms.map((name) => (
              <ListBox.Item key={name} id={name} textValue={name}>
                {name}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
        <Description>
          {value.platform
            ? '使用指定平台签名。'
            : value.mode === 'id'
              ? 'ID 请求使用默认平台，也可在此指定平台。'
              : '自动识别跳转链接，未识别时使用默认平台。'}
        </Description>
      </Select>
      {value.mode === 'custom' ? (
        <>
          <Field
            label="歌曲名称 · title"
            value={value.title}
            onChange={(v) => update('title', v)}
            required
            error={errors.title}
          />
          <Field
            label="歌手 · singer"
            value={value.singer}
            onChange={(v) => update('singer', v)}
            description="选填"
          />
          <Field
            label="跳转链接 · url"
            type="url"
            value={value.url}
            onChange={(v) => update('url', v)}
            required
            error={errors.url}
          />
          <Field
            label="音频链接 · audio"
            type="url"
            value={value.audio}
            onChange={(v) => update('audio', v)}
            description="选填，留空不写入 JSON。"
            error={errors.audio}
          />
          <Field
            label="封面链接 · image"
            type="url"
            value={value.image}
            onChange={(v) => update('image', v)}
            description="选填，留空不写入 JSON。"
            error={errors.image}
          />
        </>
      ) : (
        <>
          <Select
            selectedKey={customSource ? '__custom__' : value.type}
            onSelectionChange={(key) => {
              if (key === null) return
              update('type', key === '__custom__' ? '' : String(key))
            }}
          >
            <Label>查询来源 · type</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {musicSourceOptions.map(({ label, value: source }) => (
                  <ListBox.Item key={source} id={source} textValue={label}>
                    {label}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
                <ListBox.Item id="__custom__" textValue="扩展来源">
                  扩展来源
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              </ListBox>
            </Select.Popover>
            <Description>选择内置来源，或选择扩展来源后填写注册名称。</Description>
          </Select>
          <Field
            label="歌曲 ID · id"
            value={value.id}
            onChange={(v) => update('id', v)}
            required
            error={errors.id}
          />
          {customSource && (
            <Field
              label="扩展来源名称"
              value={value.type}
              onChange={(v) => update('type', v)}
              description="填写其他插件注册的来源名称。"
              required
              error={errors.type}
            />
          )}
        </>
      )}
      <JsonPreview label="测试歌曲 JSON" value={musicFromForm(value, previous)} />
    </Section>
  )
}
