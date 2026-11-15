import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve as resolvePath, sep } from 'node:path'
import { MusicSigner, normalizeRequest, cardText } from '../lib/models/music-sign.js'
import { MusicCardCache } from '../lib/models/music-cache.js'

const input = {
  title: '晴天',
  singer: '周杰伦',
  url: 'https://example.com/song/1',
  audio: 'https://example.com/audio/1.mp3',
  image: 'https://example.com/cover/1.jpg'
}

// 字段形状按 icqq 接收 JSON 和 QQ 音卡格式构造，非真实账号抓包。
function card(overrides = {}) {
  return {
    app: 'com.tencent.music.lua',
    view: 'music',
    ver: '0.0.0.1',
    prompt: `[分享]${overrides.title ?? '晴天'}`,
    config: { forward: true, type: 'normal' },
    extra: JSON.stringify({ appid: 100497308, app_type: 1, uin: 123456789 }),
    meta: {
      music: {
        appid: 100497308,
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

class QQBoundary extends EventEmitter {
  uin = 123456789
  online = true
  shares = []
  pickFriend(id) {
    assert.equal(id, this.uin)
    return {
      share: async (content, app) => {
        this.shares.push({ content, app })
        await this.onShare?.(content, app)
      }
    }
  }
  deliver(ark, event = 'sync.message', from = this.uin, to = this.uin) {
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

test('默认 QQ 并接受协议常用别名，不把 custom 当平台', () => {
  const request = normalizeRequest({ data: { ...input, type: 'custom', content: input.singer } })
  assert.equal(request.platform.appid, 100497308)
  assert.equal(request.content.summary, '周杰伦')
  assert.equal(request.content.audio, input.audio)
  assert.throws(() => normalizeRequest({ ...input, url: 'file:///etc/passwd' }), /http/i)
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
  assert.equal(bot.shares[0].content.type, 'share')
  assert.equal(bot.shares[0].app.appname, 'com.tencent.qqmusic')
})

test('忽略他人、发给他人、错误平台或字段的卡，再接受自己正确私聊', async (t) => {
  const bot = new QQBoundary()
  const signer = new MusicSigner({ getBots: () => [bot], timeoutMs: 100 })
  t.after(() => signer.close())
  bot.onShare = () => {
    bot.deliver(card(), 'sync.message', 987654321)
    bot.deliver(card(), 'sync.message', bot.uin, 987654321)
    bot.deliver(card({ appid: 100495085 }))
    bot.deliver(card({ desc: '另一位歌手' }))
    bot.deliver(card({ musicUrl: 'https://example.com/wrong.mp3' }))
    bot.deliver(card(), 'message.private')
  }
  assert.deepEqual(await signer.sign(input), card())
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
  const oldBots = []
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
  bot.onShare = () => bot.deliver(card())
  await Promise.all(
    Array.from({ length: 20 }, () => signer.sign({ type: '163', id: '000186016', _platform: 'qq' }))
  )
  assert.equal(queries, 1)
  assert.equal(bot.shares.length, 1)
})

async function diskCache(t) {
  const directory = await mkdtemp(join(tmpdir(), 'music-card-cache-'))
  t.after(() => {
    assert.ok(resolvePath(directory).startsWith(resolvePath(tmpdir()) + sep))
    return rm(directory, { force: true, recursive: true })
  })
  return new MusicCardCache(join(directory, 'cards'))
}

test('不同 prompt 的并发请求分别匹配回包并保存各自缓存', async (t) => {
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
  t.after(async () => {
    signer.close()
    await Promise.allSettled([first, second])
  })
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
  const cache = await diskCache(t)
  const bot = new QQBoundary()
  const signer = new MusicSigner({ getBots: () => [bot], cache })
  const entered = Promise.withResolvers()
  const release = Promise.withResolvers()
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
  let oldRequest
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
    const restarted = new MusicSigner({ getBots: () => [bot], cache })
    t.after(() => restarted.close())
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
  t.after(() => signer.close())
  bot.onShare = () => bot.deliver(card())
  const request = { type: '163', id: '000186016', _platform: 'qq' }
  const raw = cardText(await signer.sign(request))
  assert.equal(cardText(await signer.sign(request)), raw)
  assert.equal(queries, 1)
  assert.equal(bot.shares.length, 1)
  await signer.sign({ ...request, id: 186016 })
  assert.equal(queries, 2, 'ID 的值或类型不同必须重新签名')
})

test('缓存隔离签名账号及应用三元组，原请求相同也不能跨账号或平台配置复用', async (t) => {
  const cache = await diskCache(t)
  const configurations = [
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
      t.after(() => signer.close())
      bot.onShare = () => bot.deliver(card({ appid: config.appid }))
      await signer.sign({ ...input, _platform: 'home' })
      assert.equal(bot.shares.length, 1)
    }
  }
})

test('相同 appid 和歌曲的不同应用配置按顺序提交，分别缓存自己的回包', async (t) => {
  const bot = new QQBoundary()
  const records = new Map()
  const signer = new MusicSigner({
    getBots: () => [bot],
    timeoutMs: 1000,
    cache: {
      get: async (key) => records.get(key) ?? null,
      set: async (key, raw, request) => records.set(key, { raw, request })
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
  let finishRead
  const signer = new MusicSigner({
    getBots: () => [bot],
    cache: {
      get: () =>
        new Promise((resolve) => {
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
  const bot = new QQBoundary()
  const cache = await diskCache(t)
  await writeFile(cache.directory, '占用缓存目录路径的文件')
  const errors = []
  const signer = new MusicSigner({
    getBots: () => [bot],
    cache,
    onCacheError: (error) => errors.push(error)
  })
  t.after(() => signer.close())
  bot.onShare = () => bot.deliver(card())
  assert.deepEqual(await signer.sign(input), card())
  assert.ok(errors.length > 0)
  assert.equal(signer.status().pending, 0)
  assert.equal(bot.listenerCount('sync.message'), 0)
})
