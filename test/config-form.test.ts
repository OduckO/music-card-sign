import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  musicForm,
  musicFromForm,
  musicFormErrors,
  platformRows,
  platformsFromRows,
  platformRowErrors
} from '../src/modules/music-card-sign/config-form'

test('平台表单省略空字段，多平台重命名后保留扩展字段并迁移旧签名别名', () => {
  const original = {
    first: { appid: 123, appname: '', app_sign: 'a'.repeat(32), extra: { enabled: true } },
    second: { appid: 456, appname: 'com.music.app', appsign: '' }
  }
  const rows = platformRows(original)
  rows[0].name = ' Renamed '
  rows[0].appsign = ''
  assert.deepEqual(platformsFromRows(rows, original), {
    renamed: { appid: 123, extra: { enabled: true } },
    second: { appid: 456, appname: 'com.music.app' }
  })
  assert.deepEqual(platformsFromRows([{ name: 'empty', appid: '' }]), { empty: {} })
  assert.equal(platformRows(original)[0].appsign, 'a'.repeat(32))
})

test('平台表单提示缺少 appid、非法整数与重复平台名', () => {
  for (const appid of ['', 0, -1, 1.2, 'bad', Number.MAX_SAFE_INTEGER + 1]) {
    const row = { name: 'test', appid }
    assert.ok(platformRowErrors(row, [row]).appid)
  }
  const rows = [
    { name: 'test', appid: 1 },
    { name: ' TEST ', appid: 2 }
  ]
  assert.ok(platformRowErrors(rows[0], rows).name)
  assert.ok(platformRowErrors({ name: '', appid: 1 }, []).name)
})

test('歌曲表单省略空选填项与自动平台，保留其他插件扩展字段', () => {
  const previous = {
    type: 'custom',
    title: '晴天',
    url: 'https://example.com/song',
    singer: '歌手',
    audio: 'https://example.com/audio',
    image: 'https://example.com/cover',
    self_id: '123',
    custom: { quality: 'high' }
  }
  const form = musicForm(previous)
  form.singer = ''
  form.audio = ''
  form.image = ''
  assert.deepEqual(musicFromForm(form, previous), {
    type: 'custom',
    title: '晴天',
    url: 'https://example.com/song',
    self_id: '123',
    custom: { quality: 'high' }
  })
  assert.ok(Object.values(musicFormErrors(form)).every((error) => !error))
  assert.ok(musicFormErrors({ ...form, title: '', url: '' }).title)
  assert.ok(musicFormErrors({ ...form, url: 'wrong' }).url)
})

test('切换 ID 模式只提交来源与 ID，切回保留草稿，并保留已有内联平台', () => {
  const previous = {
    type: 'custom',
    title: '原歌名',
    url: 'https://example.com/song',
    _platform: { appid: 102021671 },
    extension: true
  }
  const form = { ...musicForm(previous), mode: 'id' as const, type: 'my_api', id: '00123' }
  assert.deepEqual(musicFromForm(form, previous), {
    type: 'my_api',
    id: '00123',
    _platform: previous._platform,
    extension: true
  })
  assert.equal(musicFromForm({ ...form, mode: 'custom' }, previous).title, '原歌名')
  assert.ok(musicFormErrors({ ...form, id: '' }).id)
  assert.ok(musicFormErrors({ ...form, type: '' }).type)
  assert.equal(musicFromForm({ ...form, platform: '' }, previous)._platform, undefined)
})

test('旧字段别名回填后规范到编辑字段，清空音频不会被旧别名覆盖', () => {
  const previous = {
    name: '别名歌曲',
    artist: '歌手',
    jump: 'https://example.com/song',
    voice: 'https://example.com/audio'
  }
  const form = musicForm(previous)
  assert.equal(form.title, '别名歌曲')
  form.audio = ''
  assert.deepEqual(musicFromForm(form, previous), {
    type: 'custom',
    title: '别名歌曲',
    singer: '歌手',
    url: 'https://example.com/song'
  })
})

test('回填遵循签名器字段优先级，ID 的默认来源与 source 平台保持原意', () => {
  const form = musicForm({
    id: '00123',
    title: '完整信息',
    type: 'netease',
    source: 'kugou',
    audio: 'https://example.com/current',
    voice: 'https://example.com/legacy'
  })
  assert.equal(form.mode, 'custom')
  assert.equal(form.audio, 'https://example.com/current')
  assert.equal(musicFromForm(form)._platform, 'kugou')
  assert.equal(musicForm({ id: '00123' }).mode, 'id')
  assert.equal(musicForm({ id: '00123', source: 'kugou' }).type, 'qq')
})
