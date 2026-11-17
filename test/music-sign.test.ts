import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve as resolvePath, sep } from 'node:path'
import { MusicSigner, MusicSignError, normalizeRequest, cardText } from '../src/models/music-sign'
import { MusicCardCache } from '../src/models/music-cache'
import { Trapper } from 'triptrap'
import type {
  AppPlatform,
  CacheRecord,
  IcqqBot,
  MusicCard,
  MusicEvent,
  MusicInfo,
  MusicRequest,
  ShareContent
} from '../src/types'

const input = {
  title: '晴天',
  singer: '周杰伦',
  url: 'https://example.com/song/1',
  audio: 'https://example.com/audio/1.mp3',
  image: 'https://example.com/cover/1.jpg'
} satisfies MusicInfo

// 字段形状按 icqq 接收 JSON 和 QQ 音卡格式构造，非真实账号抓包。
function card(overrides: Partial<MusicCard['meta']['music']> = {}): MusicCard {
  return {
    app: 'com.tencent.music.lua',
    view: 'music',
    ver: '0.0.0.1',
    prompt: `[分享]${overrides.title ?? '晴天'}`,
    config: { forward: true, type: 'normal' },
    extra: JSON.stringify({ appid: overrides.appid ?? 102021671, app_type: 1, uin: 123456789 }),
    meta: {
      music: {
        appid: 102021671,
        title: '晴天',
        desc: '周杰伦',
        jumpUrl: 'https://example.com/song/1',
        musicUrl: 'https://example.com/audio/1.mp3',
        preview: 'https://example.com/cover/1.jpg',
        ...overrides
      }
    },
    server_field: '必须原样保留'
  }
}

class QQBoundary extends EventEmitter implements IcqqBot {
  uin = 123456789
  online = true
  targets: number[] = []
  shares: Array<{ content: ShareContent; app: AppPlatform }> = []
  onShare?: (content: ShareContent, app: AppPlatform, targetId: number) => unknown
  pickFriend(id: number) {
    this.targets.push(id)
    return {
      share: async (content: ShareContent, app: AppPlatform) => {
        this.shares.push({ content, app })
        await this.onShare?.(content, app, id)
      }
    }
  }
  deliver(ark: MusicCard, event = 'sync.message', from = this.uin, to = this.uin) {
    this.emit(event, {
      self_id: this.uin,
      message_type: 'private',
      from_id: from,
      to_id: to,
      user_id: from,
      time: Math.floor(Date.now() / 1000),
      message: [{ type: 'json', data: JSON.stringify(ark) }]
    })
  }
}

test('酷狗概念版支持默认与显式选择，清理平台后缀并按原始请求分别缓存', async (t) => {
  t.after(() => signer.close())
  const platform = {
    appid: 101706348,
    appname: 'com.kugou.android.lite',
    appsign: 'fe4a24d80fcf253a00676a808f62c2c6'
  }
  assert.deepEqual(normalizeRequest(input, {}, 'kugou_concept').platform, platform)
  for (const field of ['_platform', 'platform', 'source']) {
    const request = normalizeRequest({ ...input, [field]: 'kugou_concept' })
    assert.deepEqual(request.platform, platform)
    assert.equal(request.content.title, input.title)
  }

  const bot = new QQBoundary()
  const signer = new MusicSigner({ getBots: () => [bot], cache: await diskCache(t) })
  bot.onShare = (content, app) =>
    bot.deliver(card({ appid: app.appid, title: content.title, jumpUrl: content.url }))
  for (const [index, [title, expectedTitle]] of (
    [
      ['她说', '她说'],
      ['她说_kugou_concept', '她说']
    ] as const
  ).entries()) {
    const request = {
      ...input,
      title,
      url: 'https://www.kugou.com/song/#hash=abc',
      _platform: 'kugou_concept'
    }
    const signed = await signer.sign(request)
    assert.deepEqual(bot.shares[index].app, platform)
    assert.equal(bot.shares[index].content.title, expectedTitle)
    assert.equal(bot.shares[index].content.content, `[分享]${expectedTitle}`)
    assert.equal(signed.meta.music.title, expectedTitle)
    assert.equal(signed.prompt, `[分享]${expectedTitle}`)
    assert.equal(
      cardText(signed),
      JSON.stringify(card({ appid: platform.appid, title: expectedTitle, jumpUrl: request.url }))
    )
    assert.equal(cardText(await signer.sign(request)), cardText(signed))
    assert.equal(bot.shares.length, index + 1)
  }
})

test('历史标题只匹配末尾完整平台名，支持 _ 与 _* 分隔符且显式平台优先', () => {
  const url = 'https://www.kugou.com/song/#hash=abc'
  for (const [title, name, appid] of [
    ['晴_天_*kugou_concept', '晴_天', 101706348],
    ['晴_*qq_*kugou_concept', '晴_*qq', 101706348],
    ['晴_天_*163', '晴_天', 100495085],
    ['晴_天_*KUGOU_CONCEPT', '晴_天', 101706348],
    ['晴天_kugou_concept', '晴天', 101706348],
    ['晴_天_kugou_concept', '晴_天', 101706348],
    ['晴_qq_kugou_concept', '晴_qq', 101706348],
    ['晴_天_KUGOU_CONCEPT', '晴_天', 101706348],
    ['晴_天_163', '晴_天', 100495085],
    ['晴_天_unknown', '晴_天_unknown', 205141],
    ['晴天_kugou_concept_extra', '晴天_kugou_concept_extra', 205141],
    ['晴天_*unknown', '晴天_*unknown', 205141],
    ['晴天_*kugou_concept_extra', '晴天_*kugou_concept_extra', 205141],
    ['晴天_*__proto__', '晴天_*__proto__', 205141]
  ] as const) {
    const data = Object.freeze({ ...input, title, url })
    const request = normalizeRequest(data)
    assert.equal(request.content.title, name)
    assert.equal(request.content.content, `[分享]${name}`)
    assert.equal(request.platform.appid, appid)
    assert.equal(data.title, title)
  }
  const data = { ...input, title: '晴_天_*kugou_concept', url }
  for (const field of ['_platform', 'platform', 'source']) {
    const request = normalizeRequest({ ...data, [field]: { appid: 200079 } })
    assert.equal(request.platform.appid, 200079)
    assert.equal(request.content.title, '晴_天')
  }
  const request = normalizeRequest(
    { ...input, title: '晴_天_*my_app' },
    { my_app: { appid: 200079 } }
  )
  assert.equal(request.platform.appid, 200079)
  assert.equal(request.content.title, '晴_天')
  const custom = normalizeRequest(
    { ...input, title: '晴_天_my_app' },
    { app: { appid: 100243533 }, my_app: { appid: 200079 } }
  )
  assert.equal(custom.platform.appid, 200079, '匹配较长的完整平台名，不截成 app')
  assert.equal(custom.content.title, '晴_天')
})

test('酷狗共享跳转与 youthandroid 音频不区分概念版，标题平台优先于链接', () => {
  const data = {
    ...input,
    url: 'https://www.kugou.com/song/#hash=B3A52A7A958BF0AED0EBFBA2E9A818B7',
    audio: 'http://fs.youthandroid2.kugou.com/202611172131/token/v3/hash/yp/full/song.mp3'
  }
  const request = normalizeRequest(data)
  assert.equal(request.platform.appid, 205141)
  assert.equal(request.content.audio, data.audio)
  assert.equal(
    normalizeRequest({ ...data, title: '晴_天_*kugou_concept' }).platform.appid,
    101706348
  )
  assert.equal(normalizeRequest({ ...data, title: '晴天_kugou_concept' }).platform.appid, 101706348)
  assert.equal(
    normalizeRequest({ ...data, url: 'https://example.com/song' }, {}, 'qq').platform.appid,
    100497308
  )
  assert.equal(
    normalizeRequest({ ...data, url: 'https://www.kugouyouth.com/', title: '晴天_*qq' }).platform
      .appid,
    100497308
  )
})

test('历史标题平台请求清理后提交，精确缓存仍区分原始请求格式', async (t) => {
  t.after(() => signer.close())
  const bot = new QQBoundary()
  const signer = new MusicSigner({ getBots: () => [bot], cache: await diskCache(t) })
  bot.onShare = (content, app) =>
    bot.deliver({
      ...card({ appid: app.appid, title: content.title, jumpUrl: content.url }),
      server_field: String(bot.shares.length)
    })
  const requests = [
    { ...input, title: '她_说_*kugou_concept', url: 'https://www.kugou.com/song/#hash=abc' },
    {
      ...input,
      title: '她_说',
      _platform: 'kugou_concept',
      url: 'https://www.kugou.com/song/#hash=abc'
    }
  ]
  for (const [index, request] of requests.entries()) {
    const original = JSON.stringify(request)
    const signed = await signer.sign(request)
    assert.equal(bot.shares[index].app.appid, 101706348)
    assert.equal(bot.shares[index].content.title, '她_说')
    assert.equal(signed.meta.music.title, '她_说')
    assert.equal(signed.prompt, '[分享]她_说')
    assert.equal(signed.server_field, String(index + 1))
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(cardText(await signer.sign(request)), cardText(signed))
    assert.equal(bot.shares.length, index + 1)
    assert.equal(JSON.stringify(request), original)
  }
  const signed = await signer.sign({
    ...input,
    title: '她_*qq_*kugou_concept',
    url: 'https://www.kugou.com/song/#hash=abc'
  })
  assert.equal(signed.meta.music.title, '她_*qq', '只移除末尾标记，保留歌名中较早的标记')
  assert.equal(signed.prompt, '[分享]她_*qq')
  assert.equal(bot.shares.at(-1)?.content.title, '她_*qq')
  const legacy = { ...requests[0], title: '她_说_kugou_concept' }
  const legacyCard = await signer.sign(legacy)
  assert.equal(legacyCard.meta.music.title, '她_说')
  assert.equal(bot.shares.at(-1)?.app.appid, 101706348)
  assert.equal(bot.shares.length, 4, '裸下划线格式也单独签名和缓存')
  assert.equal(cardText(await signer.sign(legacy)), cardText(legacyCard))
  assert.equal(bot.shares.length, 4)
  const custom = new MusicSigner({
    getBots: () => [bot],
    customPlatforms: { my_app: { appid: 200079 } }
  })
  t.after(() => custom.close())
  assert.equal(
    (await custom.sign({ ...input, title: '她_*qq_*my_app' })).meta.music.title,
    '她_*qq'
  )
})

test('历史标题平台请求不复用标题尚未清理的旧缓存', async (t) => {
  const bot = new QQBoundary()
  const title = '晴天_*kugou'
  const request = normalizeRequest({ ...input, _platform: 'kugou' })
  const signer = new MusicSigner({
    getBots: () => [bot],
    cache: {
      get: async (key) => ({
        version: 1,
        key,
        raw: JSON.stringify(card({ appid: 205141, title })),
        request: {
          ...request,
          content: { ...request.content, title, content: `[分享]${title}` }
        }
      }),
      set: async () => {}
    }
  })
  t.after(() => signer.close())
  bot.onShare = (content, app) => bot.deliver(card({ appid: app.appid, title: content.title }))
  assert.equal((await signer.sign({ ...input, title })).meta.music.title, '晴天')
  assert.equal(bot.shares.length, 1)
})

test('空队列立即注册等待项，下一微任务提交，关闭前尚未提交的请求不发送', async (t) => {
  const bot = new QQBoundary()
  const signer = new MusicSigner({ getBots: () => [bot] })
  t.after(() => signer.close())
  bot.onShare = () => bot.deliver(card())
  const signing = signer.sign(input)
  assert.equal(signer.status().pending, 1)
  assert.equal(bot.listenerCount('sync.message'), 1)
  assert.equal(bot.shares.length, 0)
  await Promise.resolve()
  assert.equal(bot.shares.length, 1)
  assert.deepEqual(await signing, card())

  const rejected = assert.rejects(signer.sign(input), /关闭/)
  await signer.close()
  await rejected
  assert.equal(bot.shares.length, 1)
  assert.equal(signer.status().pending, 0)
  assert.equal(signer.inflight.size, 0)
  assert.equal(signer.submissions.size, 0)
  assert.equal(signer.listeners.size, 0)
})

test('完整回包立即返回，不等待缓存落盘或分享回执，落盘期间精确复用', async (t) => {
  const bot = new QQBoundary()
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const shareReply = Promise.withResolvers<void>()
  const records = new Map<string, CacheRecord>()
  const signer = new MusicSigner({
    getBots: () => [bot],
    cache: {
      get: async (key) => records.get(key) ?? null,
      set: async (key, raw, request) => {
        entered.resolve()
        await release.promise
        records.set(key, { version: 1, key, raw, request })
      }
    }
  })
  t.after(async () => {
    release.resolve()
    shareReply.resolve()
    await signer.close()
  })
  bot.onShare = () => {
    bot.deliver({ ...card(), server_field: String(bot.shares.length) })
    return shareReply.promise
  }
  let returned = false
  const signing = signer.sign(input).then((signed) => {
    returned = true
    return signed
  })
  await entered.promise
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(returned, true, '已收到完整 JSON 时不应等待磁盘写入')
  const signed = await signing
  assert.equal(cardText(await signer.sign(input)), cardText(signed))
  assert.equal(bot.shares.length, 1, '落盘期间相同请求直接复用已收到的原卡')
  await signer.sign({ ...input, image: 'https://example.com/other.jpg' })
  assert.equal(bot.shares.length, 2, '请求体有任何差异都不能复用')
  const fresh = await signer.sign(input, { forceFresh: true })
  assert.equal(fresh.server_field, '3')
  assert.equal(cardText(await signer.sign(input)), cardText(fresh))
  release.resolve()
  await signer.close()
  assert.ok([...records.values()].some(({ raw }) => raw === cardText(fresh)))
  assert.ok([...records.values()].every(({ raw }) => raw !== cardText(signed)))
  assert.equal(signer.cacheWrites.size, 0)
  assert.equal(signer.status().pending, 0)
  assert.equal(bot.listenerCount('sync.message'), 0)
})

for (const protocol of ['EventEmitter', 'triptrap'] as const) {
  test(`${protocol} 在后续业务监听抛错前捕获回包，立即成功或返回字段错误`, async (t) => {
    const bot = new QQBoundary()
    const events = new Trapper()
    let downstream = 0
    const fail = () => {
      downstream++
      throw new Error('其他插件处理失败')
    }
    if (protocol === 'triptrap') {
      Object.assign(bot, {
        on: (name: string, listener: (event: MusicEvent) => void) => events.trap(name, listener),
        prependListener: undefined
      })
      events.trap('message.private', fail)
    } else {
      bot.on('message.private', fail)
    }
    const signer = new MusicSigner({ getBots: () => [bot], timeoutMs: 1000 })
    t.after(() => signer.close())
    let invalid = false
    bot.onShare = () => {
      const event: MusicEvent = {
        self_id: bot.uin,
        from_id: bot.uin,
        to_id: bot.uin,
        message: [{ type: 'json', data: JSON.stringify(card(invalid ? { desc: '错误歌手' } : {})) }]
      }
      if (protocol === 'triptrap') {
        events.trip('message.private.friend', event)
        events.trip('message.private', event)
      } else {
        bot.emit('message.private', event)
      }
    }
    assert.equal(cardText(await signer.sign(input)), JSON.stringify(card()))
    invalid = true
    await assert.rejects(signer.sign(input), /回传字段不匹配：desc/)
    assert.equal(downstream, 2, '保留其他监听，捕获回包后不吞掉它们的执行')
    assert.equal(signer.status().pending, 0)
    assert.equal(bot.listenerCount('sync.message'), 0)
    assert.equal(events.listeners('message.private.friend').length, 0)
    assert.equal(events.listeners('message.private.self').length, 0)
  })
}

test('默认应用使用 102021671 和空包名、签名，不把 custom 当平台', () => {
  const request = normalizeRequest({ data: { ...input, type: 'custom', content: input.singer } })
  assert.deepEqual(request.platform, {
    appid: 102021671,
    appname: '',
    appsign: ''
  })
  assert.equal(request.content.summary, '周杰伦')
  assert.equal(request.content.audio, input.audio)
  assert.throws(() => normalizeRequest({ ...input, url: 'file:///etc/passwd' }), /http/i)
})

test('audio 省略、空字符串或 null 可签名，精确缓存分别复用且回传后释放监听', async (t) => {
  t.after(() => signer.close())
  const bot = new QQBoundary()
  const signer = new MusicSigner({
    getBots: () => [bot],
    cache: await diskCache(t),
    timeoutMs: 100
  })
  const withoutAudio: MusicRequest = { ...input }
  delete withoutAudio.audio
  const requests = [
    withoutAudio,
    { ...withoutAudio, audio: '' },
    { ...withoutAudio, audio: null }
  ] satisfies MusicRequest[]
  bot.onShare = (content) => {
    assert.equal(content.audio, '')
    const ark = card({ musicUrl: '', preview: `https://qq.ugcimg.cn/cover/${bot.shares.length}` })
    if (bot.shares.length === 1) delete ark.meta.music.musicUrl
    bot.deliver(ark)
  }
  for (const [index, request] of requests.entries()) {
    const signed = await signer.sign(request)
    assert.equal(signed.meta.music.preview, `https://qq.ugcimg.cn/cover/${index + 1}`)
    assert.equal(cardText(await signer.sign(request)), cardText(signed))
    assert.equal(bot.shares.length, index + 1, '省略、空字符串和 null 的原始请求分别缓存')
    assert.equal(signer.status().pending, 0)
    assert.equal(bot.listenerCount('sync.message'), 0)
    assert.equal(bot.listenerCount('message.private'), 0)
  }
  for (const audio of ['file:///music.mp3', 'invalid']) {
    await assert.rejects(signer.sign({ ...withoutAudio, audio }), /audio 必须是 http\(s\) URL/)
  }
  assert.equal(bot.shares.length, requests.length, '非空无效音频地址在提交前返回错误')
})

test('默认平台独立于歌曲来源，显式平台覆盖默认配置且支持自定义名称', () => {
  for (const type of ['custom', 'qq', '163', 'my-plugin']) {
    assert.equal(normalizeRequest({ ...input, type }, {}, 'default').platform.appid, 102021671)
  }
  assert.equal(normalizeRequest(input, {}, 'qq').platform.appid, 100497308)
  assert.equal(
    normalizeRequest({ ...input, _platform: 'qq' }, {}, 'default').platform.appid,
    100497308
  )
  assert.equal(
    normalizeRequest({ ...input, _platform: '163' }, {}, 'default').platform.appid,
    100495085
  )
  const app = { appid: 200079, appname: 'com.sing.client', app_sign: '' }
  assert.deepEqual(normalizeRequest(input, { mine: app }, 'mine').platform, {
    appid: 200079,
    appname: 'com.sing.client',
    appsign: ''
  })
  assert.throws(
    () => new MusicSigner({ getBots: () => [], defaultPlatform: 'unknown' }),
    /未知音卡平台/
  )
})

test('移除内置 txqq，显式应用信息和用户自定义平台仍可使用', () => {
  for (const field of ['_platform', 'platform', 'source']) {
    assert.throws(() => normalizeRequest({ ...input, [field]: 'txqq' }), /未知音卡平台/)
  }
  assert.throws(
    () => new MusicSigner({ getBots: () => [], defaultPlatform: 'txqq' }),
    /未知音卡平台/
  )
  for (const appid of [35055, 100686848]) {
    assert.deepEqual(normalizeRequest({ ...input, _platform: { appid } }).platform, {
      appid,
      appname: '',
      appsign: ''
    })
  }
  assert.equal(normalizeRequest(input, { txqq: { appid: 200079 } }, 'txqq').platform.appid, 200079)
})

test('跳转链接按域名识别内置平台，支持子域名、短链接及更具体的平台域名', () => {
  const cases = [
    ['https://y.qq.com/n/ryqq/songDetail/00123', 100497308],
    ['https://I.Y.QQ.COM/v8/playsong.html?songmid=00123', 100497308],
    ['https://music.163.com/#/song?id=186016', 100495085],
    ['https://y.music.163.com/m/song?id=186016', 100495085],
    ['https://music.163.com./song?id=186016', 100495085],
    ['https://163cn.tv/abcd', 100495085],
    ['http://www.kuwo.cn/play_detail/123', 100243533],
    ['https://www.kugou.com/song/#hash=abc', 205141],
    ['https://www.kugouyouth.com/', 101706348],
    ['https://music.migu.cn/v3/music/song/123', 1101053067],
    ['https://www.bilibili.com/audio/au123', 100951776],
    ['https://b23.tv/abcd', 100951776],
    ['https://5sing.kugou.com/yc/123.html', 200079],
    ['https://5sing.com/yc/123.html', 200079],
    ['https://bd.kuwo.cn/play_detail/123', 100243533],
    ['https://bodian.kuwo.cn/', 101904722],
    ['https://bodian-oia.kuwo.cn/', 101904722],
    ['https://tim.qq.com/', 1105296740],
    ['https://ys.mihoyo.com/', 1110976923],
    ['https://genshin.hoyoverse.com/', 1110976923]
  ] as const
  for (const [url, appid] of cases) {
    assert.equal(normalizeRequest({ ...input, url }, {}, 'qq').platform.appid, appid, url)
  }
})

test('跳转链接识别遵守显式平台与链接字段优先级，未知域名回退默认且不识别 audio', () => {
  const url = 'https://music.163.com/song?id=186016'
  for (const field of ['jump', 'jumpUrl', 'url', 'link']) {
    const data = { ...input, url: undefined, [field]: url }
    assert.equal(normalizeRequest({ data }).platform.appid, 100495085, field)
  }
  assert.equal(
    normalizeRequest({ ...input, jump: 'https://y.qq.com/song/1', url }).platform.appid,
    100497308
  )
  for (const field of ['_platform', 'platform', 'source']) {
    assert.equal(normalizeRequest({ ...input, url, [field]: 'default' }).platform.appid, 102021671)
  }
  assert.equal(
    normalizeRequest({ ...input, url, _platform: 'qq', platform: 'default', source: '163' })
      .platform.appid,
    100497308
  )
  const custom = { appid: 200079, appname: 'com.sing.client', appsign: '' }
  assert.deepEqual(normalizeRequest({ ...input, url, _platform: custom }).platform, custom)
  assert.deepEqual(
    normalizeRequest({ ...input, url, _platform: 'mine' }, { mine: custom }).platform,
    custom
  )
  assert.throws(() => normalizeRequest({ ...input, url, _platform: 'unknown' }), /未知音卡平台/)
  for (const unknown of [
    'https://example.com/song',
    'https://im.qq.com/',
    'https://example.com/?next=https://music.163.com/song',
    'https://example.com/#y.qq.com',
    'https://music.163.com.example.com/song',
    'https://notmusic.163.com/song',
    'https://notkugou.com/song',
    'https://kugouyouth.com.example.com/song',
    'http://constructor/song',
    'http://__proto__/song'
  ]) {
    assert.equal(
      normalizeRequest({ ...input, url: unknown, audio: url, image: 'https://y.qq.com/cover.jpg' })
        .platform.appid,
      102021671,
      unknown
    )
  }
  assert.equal(normalizeRequest(input, {}, 'qq').platform.appid, 100497308)
})

test('扩展平台允许省略 appname 与 appsign，非空包名仍需合法', () => {
  for (const optional of [{}, { appname: '' }, { appname: '', app_sign: '' }]) {
    assert.deepEqual(
      normalizeRequest({
        ...input,
        url: 'https://music.163.com/song?id=186016',
        _platform: { appid: 200079, ...optional }
      }).platform,
      { appid: 200079, appname: '', appsign: '' }
    )
  }
  assert.throws(
    () => normalizeRequest({ ...input, _platform: { appid: 200079, appname: 'invalid/package' } }),
    /appname/
  )
})

test('跳转链接识别用于实际分享和精确缓存，显式扩展平台可只传 appid', async (t) => {
  t.after(() => signer.close())
  t.after(() => other.close())
  const bot = new QQBoundary()
  const cache = await diskCache(t)
  const signer = new MusicSigner({ getBots: () => [bot], cache, timeoutMs: 1000 })
  const other = new MusicSigner({
    getBots: () => [bot],
    cache,
    timeoutMs: 1000,
    defaultPlatform: 'qq'
  })
  bot.onShare = (content, app) => bot.deliver(card({ appid: app.appid, jumpUrl: content.url }))
  const data = { ...input, url: 'https://music.163.com/song?id=186016' }
  const signed = await signer.sign(data)
  assert.equal(signed.meta.music.appid, 100495085)
  assert.equal(cardText(await signer.sign(data)), cardText(signed))
  const forced = await signer.sign({ ...data, _platform: { appid: 200079 } })
  assert.equal(forced.meta.music.appid, 200079)
  assert.deepEqual(bot.shares[1].app, { appid: 200079, appname: '', appsign: '' })
  assert.equal(bot.shares.length, 2, '显式平台变化单独签名和缓存')
  await signer.close()
  assert.equal(cardText(await other.sign(data)), cardText(signed))
  assert.equal(bot.shares.length, 2, '识别后的实际平台相同，默认配置变化仍复用相同请求')
})

test('多个等待歌曲时，回包只校验对应请求，其他音卡不扫描等待字段', async (t) => {
  const bot = new QQBoundary()
  const signer = new MusicSigner({ getBots: () => [bot], timeoutMs: 1000 })
  t.after(() => signer.close())
  const requests = Array.from({ length: 64 }, (_, index) =>
    signer.sign({ ...input, title: `歌曲${index}` }).catch((error: unknown) => error)
  )
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(bot.shares.length, 64)
  let comparisons = 0
  for (const { request } of signer.pending.values()) {
    const summary = request.content.summary
    Object.defineProperty(request.content, 'summary', {
      get: () => {
        comparisons++
        return summary
      }
    })
  }
  bot.deliver(card({ title: '其他歌曲' }))
  assert.equal(comparisons, 0, '不属于等待请求的回包无需比较歌手和音频')
  bot.deliver(card({ title: '歌曲31' }))
  assert.deepEqual(await requests[31], card({ title: '歌曲31' }))
  assert.equal(comparisons, 1, '只校验命中的一首歌')
  await signer.close()
  await Promise.all(requests)
  assert.equal(bot.listenerCount('sync.message'), 0)
  assert.equal(bot.listenerCount('message.private'), 0)
})

test('回包标记只关联相同账号、联系人和消息 ID，短期记录有上限且关闭释放', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1800000000000 })
  const bot = new QQBoundary()
  const targetId = 987654321
  const signer = new MusicSigner({ getBots: () => [bot], targetId })
  t.after(() => signer.close())
  const event = (message_id: string): MusicEvent => ({
    self_id: bot.uin,
    from_id: bot.uin,
    to_id: targetId,
    message_type: 'private',
    message_id,
    message: [{ type: 'json', data: JSON.stringify(card()) }]
  })
  bot.onShare = () => bot.emit('sync.message', event(`signed:${bot.shares.length}`))
  await signer.sign(input)
  assert.equal(signer.isSigningEcho(event('signed:1')), true)
  assert.equal(signer.isSigningEcho({ ...event('signed:1'), from_id: 111222333 }), false)
  assert.equal(signer.isSigningEcho({ ...event('signed:1'), self_id: 111222333 }), false)
  assert.equal(signer.isSigningEcho({ ...event('signed:1'), to_id: bot.uin }), false)
  assert.equal(signer.isSigningEcho({ ...event('signed:1'), group_id: 12345 }), false)
  assert.equal(signer.isSigningEcho(event('other')), false)
  t.mock.timers.tick(30000)
  assert.equal(signer.isSigningEcho(event('signed:1')), false)
  assert.equal(signer.echoes.size, 0)
  for (let index = 0; index < 257; index++) await signer.sign(input, { forceFresh: true })
  assert.equal(signer.echoes.size, 256)
  assert.equal(signer.isSigningEcho(event('signed:2')), false)
  assert.equal(signer.isSigningEcho(event('signed:258')), true)
  assert.equal(signer.pending.size, 0)
  assert.equal(signer.listeners.size, 0)
  assert.equal(signer.inflight.size, 0)
  assert.equal(signer.submissions.size, 0)
  await signer.close()
  assert.equal(signer.echoes.size, 0)
})

test('已知音乐域名的封面和跳转链接升级 HTTPS，音频与其他域名保持原值', () => {
  const request = normalizeRequest({
    ...input,
    url: 'http://y.qq.com/n/ryqq/songDetail/001',
    image: 'http://p2.music.126.net/cover.jpg?size=300',
    audio: 'http://example.com/audio.mp3'
  })
  assert.equal(request.content.url, 'https://y.qq.com/n/ryqq/songDetail/001')
  assert.equal(request.content.image, 'https://p2.music.126.net/cover.jpg?size=300')
  assert.equal(request.content.audio, 'http://example.com/audio.mp3')
  for (const image of ['http://example.com/cover.jpg', 'http://qq.com.example.com/cover.jpg']) {
    assert.equal(normalizeRequest({ ...input, image }).content.image, image)
  }
})

test('QQ 转存封面仍接受回包，相同原请求命中缓存，改变封面必须重新签名', async (t) => {
  t.after(() => signer.close())
  const bot = new QQBoundary()
  const signer = new MusicSigner({
    getBots: () => [bot],
    cache: await diskCache(t),
    timeoutMs: 100
  })
  bot.onShare = () =>
    bot.deliver(card({ preview: `https://qq.ugcimg.cn/cover/${bot.shares.length}` }))
  const first = await signer.sign(input)
  assert.equal(first.meta.music.preview, 'https://qq.ugcimg.cn/cover/1')
  assert.equal(cardText(await signer.sign(input)), cardText(first))
  const second = await signer.sign({ ...input, image: 'https://example.com/cover/2.jpg' })
  assert.equal(second.meta.music.preview, 'https://qq.ugcimg.cn/cover/2')
  assert.equal(bot.shares.length, 2)
})

test('确认本次回包的歌手或音频不匹配时立即失败，列出字段并释放监听器', async (t) => {
  const bot = new QQBoundary()
  const signer = new MusicSigner({ getBots: () => [bot], timeoutMs: 100 })
  t.after(() => signer.close())
  bot.onShare = () =>
    bot.deliver(card({ desc: '错误歌手', musicUrl: 'https://example.com/wrong.mp3' }))
  await assert.rejects(signer.sign(input), (error: unknown) => {
    assert.ok(error instanceof MusicSignError)
    assert.equal(error.status, 502)
    assert.ok('details' in error)
    assert.deepEqual(error.details, { fields: ['desc', 'musicUrl'] })
    assert.match(error.message, /desc.*musicUrl/)
    return true
  })
  assert.equal(signer.status().pending, 0)
  assert.equal(bot.listenerCount('sync.message'), 0)
  assert.equal(bot.listenerCount('message.private'), 0)
  bot.onShare = () => bot.deliver(card())
  assert.deepEqual(await signer.sign(input), card())
})

test('歌曲相同但歌手或音频不同的请求串行提交，各自获得对应回包', async (t) => {
  const bot = new QQBoundary()
  const signer = new MusicSigner({ getBots: () => [bot], timeoutMs: 1000 })
  const first = signer.sign(input)
  const second = signer.sign({
    ...input,
    singer: '另一位歌手',
    audio: 'https://example.com/other.mp3'
  })
  first.catch(() => {})
  second.catch(() => {})
  t.after(async () => {
    await signer.close()
    await Promise.allSettled([first, second])
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(bot.shares.length, 1)
  bot.deliver(card())
  assert.deepEqual(await first, card())
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(bot.shares.length, 2)
  const other = card({ desc: '另一位歌手', musicUrl: 'https://example.com/other.mp3' })
  bot.deliver(other)
  assert.deepEqual(await second, other)
  assert.equal(signer.submissions.size, 0)
})

test('隐藏平台字段切换网易云，也支持应用三元组', () => {
  assert.equal(normalizeRequest({ ...input, _platform: '163' }).platform.appid, 100495085)
  const custom = {
    appid: 200079,
    appname: 'com.sing.client',
    appsign: '3fa2b7951bbf704a052bd2364f3e3ee1'
  }
  assert.deepEqual(normalizeRequest({ ...input, _platform: custom }).platform, custom)
  assert.throws(() => normalizeRequest({ ...input, _platform: '不存在的平台' }), /平台/)
  assert.throws(
    () => normalizeRequest({ ...input, _platform: { ...custom, appsign: 'bad' } }),
    /appsign/
  )
})

test('隐藏平台允许空 appsign，兼容 app_sign 字段和省略签名', () => {
  const custom = { appid: 200079, appname: 'com.sing.client' }
  for (const signature of [{ appsign: '' }, { app_sign: '' }, {}]) {
    assert.equal(
      normalizeRequest({ ...input, _platform: { ...custom, ...signature } }).platform.appsign,
      ''
    )
  }
  const hash = '3fa2b7951bbf704a052bd2364f3e3ee1'
  assert.equal(
    normalizeRequest({ ...input, _platform: { ...custom, app_sign: hash } }).platform.appsign,
    hash
  )
})

test('先监听再 share，可接同步回传，返回完整服务端 JSON', async (t) => {
  const bot = new QQBoundary()
  const signer = new MusicSigner({ getBots: () => [bot], timeoutMs: 80 })
  t.after(() => signer.close())
  const ark = card()
  bot.onShare = () => bot.deliver(ark)
  const signed = await signer.sign(input)
  assert.deepEqual(signed, ark)
  assert.deepEqual(bot.targets, [bot.uin])
  assert.equal(bot.shares[0].content.type, 'share')
  assert.deepEqual(bot.shares[0].app, { appid: 102021671, appname: '', appsign: '' })
})

test('忽略他人、发给他人、其他平台或歌曲的卡，再接受自己正确私聊', async (t) => {
  const bot = new QQBoundary()
  const signer = new MusicSigner({ getBots: () => [bot], timeoutMs: 100 })
  t.after(() => signer.close())
  bot.onShare = () => {
    bot.deliver(card(), 'sync.message', 987654321)
    bot.deliver(card(), 'sync.message', bot.uin, 987654321)
    bot.deliver(card({ appid: 100495085 }))
    bot.deliver(card({ title: '另一首歌' }))
    bot.deliver(card({ jumpUrl: 'https://example.com/another-song' }))
    bot.deliver(card(), 'message.private')
  }
  assert.deepEqual(await signer.sign(input), card())
})

test('向配置联系人分享，仅接受签名 Bot 发给该联系人的匹配同步卡', async (t) => {
  const bot = new QQBoundary()
  const targetId = 987654321
  const options = { getBots: () => [{ sdk: bot }], targetId: String(targetId), timeoutMs: 100 }
  const signer = new MusicSigner(options)
  t.after(() => signer.close())
  const ark = card()
  bot.onShare = (_content, _app, target) => {
    assert.equal(target, targetId)
    bot.deliver(ark, 'message.private', targetId, bot.uin)
    bot.deliver(ark, 'sync.message', bot.uin, bot.uin)
    bot.deliver(ark, 'sync.message', bot.uin, 234567890)
    bot.deliver(card({ title: '另一首歌' }), 'sync.message', bot.uin, targetId)
    assert.equal(signer.status().pending, 1)
    bot.deliver(ark, 'sync.message', bot.uin, targetId)
  }
  assert.deepEqual(await signer.sign(input), ark)
  assert.deepEqual(bot.targets, [targetId])
  assert.equal(signer.status().pending, 0)
  assert.equal(bot.listenerCount('sync.message'), 0)
})

test('联系人回传超时说明接收 QQ，超时和提交失败都释放监听器', async (t) => {
  const bot = new QQBoundary()
  const options = { getBots: () => [bot], targetId: '987654321', timeoutMs: 15 }
  const signer = new MusicSigner(options)
  t.after(() => signer.close())
  await assert.rejects(signer.sign(input), /987654321.*超时/)
  assert.equal(signer.status().pending, 0)
  assert.equal(bot.listenerCount('sync.message'), 0)
  bot.onShare = () => {
    throw new Error('联系人不可用')
  }
  await assert.rejects(signer.sign(input), /联系人不可用/)
  assert.equal(signer.status().pending, 0)
  assert.equal(bot.listenerCount('message.private'), 0)
})

test('联系人配置拒绝无效 QQ 号，不注册监听或发送分享', () => {
  const bot = new QQBoundary()
  for (const targetId of ['0', '-1', '1.5', '9007199254740992', 'abc']) {
    const options = { getBots: () => [bot], targetId }
    assert.throws(() => new MusicSigner(options), /联系人.*QQ/)
  }
  assert.deepEqual(bot.targets, [])
  assert.equal(bot.listenerCount('sync.message'), 0)
})

test('同一首歌并发只签一次，不同请求不会互相取走回传', async (t) => {
  const bot = new QQBoundary()
  const signer = new MusicSigner({ getBots: () => [bot], timeoutMs: 100 })
  t.after(() => signer.close())
  const first = signer.sign(input)
  const duplicate = signer.sign(input)
  const other = signer.sign({ ...input, title: '夜曲' })
  await new Promise((resolve) => setImmediate(resolve))
  bot.deliver(card({ title: '夜曲' }))
  bot.deliver(card())
  assert.equal((await other).meta.music.title, '夜曲')
  assert.deepEqual(await first, await duplicate)
  assert.equal(bot.shares.length, 2)
})

test('超时及发送失败不会留下等待项，关闭后释放 sdk 监听器', async () => {
  const bot = new QQBoundary()
  const signer = new MusicSigner({ getBots: () => [bot], timeoutMs: 15 })
  await assert.rejects(signer.sign(input), /超时/)
  bot.onShare = () => {
    throw new Error('QQ 拒绝应用')
  }
  await assert.rejects(signer.sign(input), /QQ 拒绝应用/)
  assert.equal(signer.status().pending, 0)
  signer.close()
  assert.equal(bot.listenerCount('message.private'), 0)
  assert.equal(bot.listenerCount('sync.message'), 0)
})

test('多账号要求明确选择，没有在线 icqq 时明确失败', async (t) => {
  const first = new QQBoundary()
  const second = new QQBoundary()
  second.uin = 234567890
  const signer = new MusicSigner({ getBots: () => [first, second], timeoutMs: 80 })
  t.after(() => signer.close())
  await assert.rejects(signer.sign(input), /多个/)
  second.onShare = () => second.deliver(card())
  assert.deepEqual(await signer.sign({ ...input, self_id: second.uin }), card())
  const offline = new MusicSigner({ getBots: () => [], timeoutMs: 80 })
  t.after(() => offline.close())
  await assert.rejects(offline.sign(input), /在线.*icqq/i)
})

test('捕获回包保留原始 JSON 文本编码', async (t) => {
  const bot = new QQBoundary()
  const signer = new MusicSigner({ getBots: () => [bot], timeoutMs: 80 })
  t.after(() => signer.close())
  const raw = JSON.stringify(card(), null, 2).replace('晴天', '\\u6674\\u5929')
  bot.onShare = () =>
    bot.emit('sync.message', {
      from_id: bot.uin,
      to_id: bot.uin,
      message: [{ type: 'json', data: raw }]
    })
  assert.equal(cardText(await signer.sign(input)), raw)
})

test('无在线账号的 ID 请求先失败，不发起歌曲查询', async (t) => {
  const signer = new MusicSigner({
    getBots: () => [],
    resolveMusic: async () => {
      assert.fail('无在线账号时不应查询音乐平台')
    }
  })
  t.after(() => signer.close())
  await assert.rejects(signer.sign({ type: 'qq', id: '000123' }), /在线.*icqq/i)
})

test('ID 查询来源保留 type 与前导零，隐藏字段只改变卡片身份', async (t) => {
  const bot = new QQBoundary()
  const signer = new MusicSigner({
    getBots: () => [{ sdk: bot }],
    timeoutMs: 80,
    resolveMusic: async (type, id) => {
      assert.equal(type, '163')
      assert.equal(id, '000186016')
      return input
    }
  })
  t.after(() => signer.close())
  bot.onShare = () => bot.deliver(card({ appid: 100951776 }))
  const signed = await signer.sign({ type: '163', id: '000186016', _platform: 'bilibili' })
  assert.equal(signed.meta.music.appid, 100951776)
  assert.equal(bot.shares[0].app.appname, 'tv.danmaku.bili')
})

test('appid 可从 extra 取得，关闭中的等待项返回明确失败', async (t) => {
  const bot = new QQBoundary()
  const signer = new MusicSigner({ getBots: () => [bot], timeoutMs: 80 })
  t.after(() => signer.close())
  const ark = card()
  delete ark.meta.music.appid
  bot.onShare = () => bot.deliver(ark)
  assert.deepEqual(await signer.sign(input), ark)
  bot.onShare = undefined
  const pending = signer.sign({ ...input, title: '另一首' })
  signer.close()
  await assert.rejects(pending, /关闭/)
  assert.equal(bot.shares.length, 1, '关闭后不能再执行已经排队的提交')
})

test('每次请求结束即释放 SDK 监听器，不持续持有旧客户端', async (t) => {
  let bot = new QQBoundary()
  const oldBots: QQBoundary[] = []
  const signer = new MusicSigner({ getBots: () => [bot], timeoutMs: 15 })
  t.after(() => signer.close())
  for (let i = 0; i < 30; i++) {
    const current = bot
    current.onShare = () => current.deliver(card())
    await signer.sign(input)
    assert.equal(current.listenerCount('sync.message'), 0)
    assert.equal(current.listenerCount('message.private'), 0)
    oldBots.push(current)
    bot = new QQBoundary()
  }
  await assert.rejects(signer.sign(input), /超时/)
  assert.equal(bot.listenerCount('sync.message'), 0)
  assert.equal(signer.status().pending, 0)
  assert.ok(oldBots.every((old) => old.listenerCount('sync.message') === 0))
})

test('同一 ID 的并发请求在歌曲查询前去重', async (t) => {
  const bot = new QQBoundary()
  let queries = 0
  const signer = new MusicSigner({
    getBots: () => [bot],
    timeoutMs: 80,
    resolveMusic: async () => {
      queries++
      await new Promise((resolve) => setImmediate(resolve))
      return input
    }
  })
  t.after(() => signer.close())
  bot.onShare = (_content, app) => bot.deliver(card({ appid: app.appid }))
  await Promise.all(
    Array.from({ length: 20 }, () => signer.sign({ type: '163', id: '000186016', _platform: 'qq' }))
  )
  assert.equal(queries, 1)
  assert.equal(bot.shares.length, 1)
})

async function diskCache(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'music-card-cache-'))
  t.after(() => {
    assert.ok(resolvePath(directory).startsWith(resolvePath(tmpdir()) + sep))
    return rm(directory, { force: true, recursive: true })
  })
  return new MusicCardCache(join(directory, 'cards'))
}

test('不同 prompt 的并发请求分别匹配回包并保存各自缓存', async (t) => {
  t.after(async () => {
    await signer.close()
    await Promise.allSettled([first, second])
  })
  const bot = new QQBoundary()
  const signer = new MusicSigner({
    getBots: () => [bot],
    cache: await diskCache(t),
    timeoutMs: 1000
  })
  const first = signer.sign({ ...input, prompt: 'First prompt' })
  const second = signer.sign({ ...input, prompt: 'Second prompt' })
  first.catch(() => {})
  second.catch(() => {})
  // 两次分享已提交，第一张回包只能完成第一项。
  while (bot.shares.length < 2) await new Promise((resolve) => setImmediate(resolve))
  bot.deliver({ ...card(), prompt: 'First prompt' })
  assert.equal(signer.pending.size, 1)
  bot.deliver({ ...card(), prompt: 'Second prompt' })
  assert.equal((await first).prompt, 'First prompt')
  assert.equal((await second).prompt, 'Second prompt')
  assert.equal((await signer.sign({ ...input, prompt: 'Second prompt' })).prompt, 'Second prompt')
  assert.equal(bot.shares.length, 2)
})

test('关闭等待旧缓存写入完成，重启后的刷新不会被旧卡覆盖', async (t) => {
  let restarted: MusicSigner | undefined
  t.after(() => restarted?.close())
  const cache = await diskCache(t)
  const bot = new QQBoundary()
  const signer = new MusicSigner({ getBots: () => [bot], cache })
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const rename = fs.rename
  let delayed = false
  fs.rename = async (...args) => {
    if (!delayed) {
      delayed = true
      entered.resolve()
      await release.promise
    }
    return rename(...args)
  }
  let oldRequest: Promise<MusicCard> | undefined
  try {
    bot.onShare = () => bot.deliver({ ...card(), server_field: '旧卡' })
    oldRequest = signer.sign(input)
    oldRequest.catch(() => {})
    await entered.promise
    let closed = false
    const closing = Promise.resolve(signer.close()).then(() => {
      closed = true
    })
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(closed, false, '关闭完成前必须等待已经开始的缓存写入')
    release.resolve()
    await closing
    await oldRequest
    restarted = new MusicSigner({ getBots: () => [bot], cache })
    bot.onShare = () => bot.deliver({ ...card(), server_field: '新卡' })
    await restarted.sign(input, { forceFresh: true })
    assert.equal((await restarted.sign(input)).server_field, '新卡')
    assert.equal(signer.inflight.size, 0)
  } finally {
    release.resolve()
    fs.rename = rename
    await signer.close()
    await Promise.allSettled([oldRequest])
  }
})

test('ID 缓存命中直接返回旧 JSON，不再查询歌曲平台', async (t) => {
  t.after(() => signer.close())
  const bot = new QQBoundary()
  let queries = 0
  const signer = new MusicSigner({
    getBots: () => [bot],
    cache: await diskCache(t),
    resolveMusic: async () => {
      queries++
      return input
    }
  })
  bot.onShare = (_content, app) => bot.deliver(card({ appid: app.appid }))
  const request = { type: '163', id: '000186016', _platform: 'qq' } satisfies MusicRequest
  const raw = cardText(await signer.sign(request))
  assert.equal(cardText(await signer.sign(request)), raw)
  assert.equal(queries, 1)
  assert.equal(bot.shares.length, 1)
  await signer.sign({ ...request, id: 186016 })
  assert.equal(queries, 2, 'ID 的值或类型不同必须重新签名')
})

test('缓存隔离签名账号及应用三元组，原请求相同也不能跨账号或平台配置复用', async (t) => {
  const signers: MusicSigner[] = []
  t.after(() => Promise.all(signers.map((signer) => signer.close())))
  const cache = await diskCache(t)
  const configurations: AppPlatform[] = [
    {
      appid: 100497308,
      appname: 'com.tencent.qqmusic',
      appsign: 'cbd27cd7c861227d013a25b2d10f0799'
    },
    {
      appid: 100497308,
      appname: 'com.tencent.qqmusic',
      appsign: '00000000000000000000000000000000'
    },
    { appid: 100497308, appname: 'com.example.music', appsign: 'cbd27cd7c861227d013a25b2d10f0799' },
    {
      appid: 100495085,
      appname: 'com.tencent.qqmusic',
      appsign: 'cbd27cd7c861227d013a25b2d10f0799'
    }
  ]
  for (const uin of [123456789, 234567890]) {
    for (const config of configurations) {
      const bot = new QQBoundary()
      bot.uin = uin
      const signer = new MusicSigner({
        getBots: () => [bot],
        cache,
        customPlatforms: { home: config }
      })
      signers.push(signer)
      bot.onShare = () => bot.deliver(card({ appid: config.appid }))
      await signer.sign({ ...input, _platform: 'home' })
      assert.equal(bot.shares.length, 1)
    }
  }
})

test('相同 appid 和歌曲的不同应用配置按顺序提交，分别缓存自己的回包', async (t) => {
  const bot = new QQBoundary()
  const records = new Map<string, CacheRecord>()
  const signer = new MusicSigner({
    getBots: () => [bot],
    timeoutMs: 1000,
    cache: {
      get: async (key) => records.get(key) ?? null,
      set: async (key, raw, request) => {
        records.set(key, { version: 1, key, raw, request })
      }
    }
  })
  const firstInput = {
    ...input,
    _platform: { appid: 200079, appname: 'com.first.music', appsign: '' }
  }
  const secondInput = {
    ...input,
    _platform: { appid: 200079, appname: 'com.second.music', appsign: '' }
  }
  const first = signer.sign(firstInput)
  const second = signer.sign(secondInput)
  first.catch(() => {})
  second.catch(() => {})
  t.after(async () => {
    await signer.close()
    await Promise.allSettled([first, second])
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(bot.shares.length, 1, '回包无法区分应用配置时不能同时提交')
  bot.deliver({ ...card({ appid: 200079 }), server_field: 'first-app' })
  assert.equal((await first).server_field, 'first-app')
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(bot.shares.length, 2)
  bot.deliver({ ...card({ appid: 200079 }), server_field: 'second-app' })
  assert.equal((await second).server_field, 'second-app')
  assert.equal((await signer.sign(firstInput)).server_field, 'first-app')
  assert.equal((await signer.sign(secondInput)).server_field, 'second-app')
  assert.equal(bot.shares.length, 2)
  assert.equal(signer.submissions.size, 0)
})

test('异步缓存读取期间修改调用方对象不会污染签名请求', async (t) => {
  const bot = new QQBoundary()
  let finishRead!: (record: CacheRecord | null) => void
  const signer = new MusicSigner({
    getBots: () => [bot],
    cache: {
      get: () =>
        new Promise<CacheRecord | null>((resolve) => {
          finishRead = resolve
        }),
      set: async () => {}
    },
    timeoutMs: 80
  })
  t.after(() => signer.close())
  bot.onShare = () => bot.deliver(card())
  const original = { ...input }
  const result = signer.sign(original)
  original.title = '另一首歌'
  finishRead(null)
  assert.equal((await result).meta.music.title, '晴天')
  assert.equal(bot.shares[0].content.title, '晴天')
})

test('缓存目录无法写入时仍返回本次成功签出的音卡并释放资源', async (t) => {
  t.after(() => signer.close())
  const bot = new QQBoundary()
  const cache = await diskCache(t)
  await writeFile(cache.directory, '占用缓存目录路径的文件')
  const errors: unknown[] = []
  const signer = new MusicSigner({
    getBots: () => [bot],
    cache,
    onCacheError: (error) => errors.push(error)
  })
  bot.onShare = () => bot.deliver(card())
  assert.deepEqual(await signer.sign(input), card())
  await signer.close()
  assert.ok(errors.length > 0)
  assert.equal(signer.status().pending, 0)
  assert.equal(bot.listenerCount('sync.message'), 0)
})
