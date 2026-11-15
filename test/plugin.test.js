import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, cp, rm, readFile, writeFile, readdir, mkdir, symlink } from 'node:fs/promises'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve as resolvePath, sep } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import YAML from 'yaml'

const command = (msg) => ({ msg, reply: async () => ({ message_id: [1] }) })

async function fixture(t, settings = {}, persisted = {}) {
  const hostRoot = await mkdtemp(join(tmpdir(), 'music-card-plugin-'))
  const directory = join(hostRoot, 'plugins/music-card-sign')
  const previousCwd = process.cwd()
  await mkdir(directory, { recursive: true })
  await mkdir(join(hostRoot, 'lib/plugins'), { recursive: true })
  await mkdir(join(hostRoot, 'config'), { recursive: true })
  await symlink(
    fileURLToPath(new URL('../node_modules', import.meta.url)),
    join(hostRoot, 'node_modules'),
    'junction'
  )
  await writeFile(join(hostRoot, 'package.json'), '{"type":"module"}')
  await writeFile(
    join(hostRoot, 'lib/plugins/config.js'),
    `import fs from 'node:fs/promises'
import YAML from 'yaml'
import _ from 'lodash'
export default async function makeConfig(name, config) {
  const filename = 'config/' + name + '.yaml'
  try { _.merge(config, YAML.parse(await fs.readFile(filename, 'utf8'))) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  const configSave = () => fs.writeFile(filename, YAML.stringify(config))
  await configSave()
  return { config, configSave }
}
`
  )
  process.chdir(hostRoot)
  t.after(() => {
    process.chdir(previousCwd)
    assert.ok(resolvePath(hostRoot).startsWith(resolvePath(tmpdir()) + sep))
    return rm(hostRoot, { recursive: true, force: true })
  })
  for (const file of ['index.js', 'package.json', 'lib', 'resources'])
    await cp(new URL('../' + file, import.meta.url), join(directory, file), { recursive: true })
  const defaultsPath = join(directory, 'resources/config/config.yaml')
  const defaults = YAML.parse(await readFile(defaultsPath, 'utf8'))
  await writeFile(defaultsPath, YAML.stringify({ ...defaults, ...settings }))
  if (persisted.legacy) {
    await mkdir(join(directory, 'config/config'), { recursive: true })
    await writeFile(join(directory, 'config/config/config.json'), JSON.stringify(persisted.legacy))
  }
  if (persisted.yaml)
    await writeFile(join(hostRoot, 'config/music-card-sign.yaml'), YAML.stringify(persisted.yaml))
  const old = { plugin: globalThis.plugin, Bot: globalThis.Bot, logger: globalThis.logger }
  t.after(() => Object.assign(globalThis, old))
  globalThis.plugin = class {
    constructor(options) {
      Object.assign(this, options)
      this.cleanup = []
    }
    addCleanup(dispose, restore) {
      this.cleanup.push({ dispose, restore })
    }
  }
  const bot = new EventEmitter()
  bot.uin = 123456789
  bot.isOnline = () => true
  const cards = []
  bot.pickFriend = (id) => ({
    share: async (content, platform) => {
      assert.equal(id, bot.uin)
      const raw = JSON.stringify(
        {
          app: 'com.tencent.structmsg',
          view: 'music',
          prompt: content.content,
          extra: 'original-extra',
          meta: {
            music: {
              appid: platform.appid,
              title: content.title,
              desc: content.summary,
              jumpUrl: content.url,
              musicUrl: content.audio,
              preview: content.image
            }
          }
        },
        null,
        2
      )
      cards.push(raw)
      bot.emit('sync.message', { from_id: id, to_id: id, message: [{ type: 'json', data: raw }] })
    }
  })
  const stack = []
  globalThis.Bot = {
    uin: [bot.uin],
    [bot.uin]: { adapter: { name: 'ICQQ' }, sdk: bot },
    express: {
      router: { stack },
      quiet: [],
      use(path, handle) {
        stack.push({ path, handle })
      }
    }
  }
  globalThis.logger = { mark() {}, info() {}, error() {}, warn() {} }
  const { apps } = await import(pathToFileURL(join(directory, 'index.js')))
  const instance = new apps.MusicCardSign()
  await instance.init()
  t.after(async () => {
    for (const cleanup of instance.cleanup) await cleanup.dispose()
  })
  return { instance, bot, stack, cards, directory }
}

test('云崽 init 挂载服务，主人音卡命令直接发送捕获 JSON，卸载释放资源', async (t) => {
  const { instance, bot, stack, cards } = await fixture(t)
  const replies = []
  const e = {
    self_id: bot.uin,
    msg:
      '#签名音卡 ' +
      JSON.stringify({
        type: 'custom',
        title: '测试',
        url: 'https://example.com/song',
        audio: 'https://example.com/audio.mp3'
      }),
    reply: async (data) => {
      replies.push(data)
      return { message_id: [1], error: [] }
    }
  }
  assert.equal(await instance.forwardCard(e), true)
  assert.deepEqual(replies, [{ type: 'json', data: cards[0] }])
  assert.equal(stack.length, 1)
  for (const cleanup of instance.cleanup) await cleanup.dispose()
  assert.equal(stack.length, 0)
  assert.equal(bot.listenerCount('sync.message'), 0)
  await Promise.all([
    instance.toggle(command('#开启音乐签名服务')),
    instance.toggle(command('#开启音乐签名服务'))
  ])
  assert.equal(stack.length, 1, '并发开启只能注册一条路由')
  await instance.toggle(command('#关闭音乐签名服务'))
  await Promise.all([
    instance.toggle(command('#开启音乐签名服务')),
    instance.toggle(command('#关闭音乐签名服务'))
  ])
  assert.equal(stack.length, 0, '后执行的关闭必须关闭并发启动的服务')
})

test('音之测测使用默认歌曲，发送完整回包并报告耗时，命令要求主人权限', async (t) => {
  const { instance, bot, cards, directory } = await fixture(t)
  const rule = instance.rule.find((entry) => entry.fnc === 'probe')
  assert.equal(rule?.permission, 'master')
  assert.ok(new RegExp(rule.reg).test('#音之测测'))
  assert.ok(new RegExp(rule.reg).test('音之测测'))
  const replies = []
  assert.equal(
    await instance.probe({
      self_id: bot.uin,
      msg: '#音之测测',
      reply: async (data) => {
        replies.push(data)
        return { message_id: [1], error: [] }
      }
    }),
    true
  )
  assert.equal(JSON.parse(cards[0]).meta.music.title, '晴天')
  assert.equal(JSON.parse(cards[0]).meta.music.appid, 100497308)
  assert.deepEqual(replies[0], { type: 'json', data: cards[0] })
  assert.match(replies[1], /音之测测通过.*\d+ ms/)
  const userConfig = YAML.parse(
    await readFile(join(directory, '../../config/music-card-sign.yaml'), 'utf8')
  )
  assert.equal(userConfig.testMusic.title, '晴天')
})

test('音之测测支持自定义测试歌曲和隐藏平台字段', async (t) => {
  const { instance, bot, cards } = await fixture(t)
  const data = {
    type: 'custom',
    _platform: '163',
    title: '其它测试',
    url: 'https://example.com/test',
    audio: 'https://example.com/test.mp3'
  }
  const replies = []
  await instance.probe({
    self_id: bot.uin,
    msg: '#音之测测 ' + JSON.stringify(data),
    reply: async (reply) => {
      replies.push(reply)
      return { message_id: [1], error: [] }
    }
  })
  assert.equal(JSON.parse(cards[0]).meta.music.appid, 100495085)
  assert.equal(JSON.parse(cards[0]).meta.music.title, '其它测试')
  assert.match(replies.at(-1), /音之测测通过/)
})

test('音之测测在服务关闭或无在线 icqq 时报告生成失败', async (t) => {
  const { instance, bot, cards } = await fixture(t)
  const replies = []
  const e = {
    self_id: bot.uin,
    msg: '#音之测测',
    reply: async (data) => {
      replies.push(data)
      return true
    }
  }
  bot.isOnline = () => false
  await instance.probe(e)
  assert.match(replies.at(-1), /音之测测失败.*生成\/回传.*在线 icqq/)
  await instance.toggle({ msg: '#关闭音乐签名服务', reply: async () => true })
  await instance.probe(e)
  assert.match(replies.at(-1), /音之测测失败.*未开启/)
  assert.equal(cards.length, 0)
})

test('音之测测报告回传超时，等待项释放后仍可继续测试', async (t) => {
  const { instance, bot } = await fixture(t, { timeoutMs: 25 })
  const replies = []
  const normal = bot.pickFriend
  bot.pickFriend = () => ({ share: async () => {} })
  const e = {
    self_id: bot.uin,
    msg: '#音之测测',
    reply: async (data) => {
      replies.push(data)
      return { message_id: [1], error: [] }
    }
  }
  await instance.probe(e)
  assert.match(replies.at(-1), /音之测测失败.*生成\/回传.*超时/)
  await instance.status(e)
  assert.match(replies.at(-1), /等待请求：0/)
  bot.pickFriend = normal
  await instance.probe(e)
  assert.match(replies.at(-1), /音之测测通过/)
})

test('音之测测区分当前会话 JSON 发送失败，不误报通过', async (t) => {
  const { instance, bot } = await fixture(t)
  const replies = []
  await instance.probe({
    self_id: bot.uin,
    msg: '#音之测测',
    reply: async (data) => {
      replies.push(data)
      return typeof data === 'object' ? { error: ['JSON unsupported'] } : true
    }
  })
  assert.equal(replies[0].type, 'json')
  assert.match(replies[1], /音之测测失败.*当前会话发送.*发送失败/)
  assert.ok(!replies.some((data) => typeof data === 'string' && data.includes('通过')))
})

const cachedInput = {
  type: 'custom',
  title: '缓存测试',
  singer: '',
  url: 'https://example.com/song?a=1&b=2',
  audio: 'https://example.com/audio.mp3',
  image: '',
  tags: { list: ['a', 'b'], count: '1' }
}
const rejectSign = (message) => {
  throw new Error(message)
}

test('相同请求保存完整原文，键顺序改变和服务重新创建后仍直接复用', async (t) => {
  const { instance, bot, cards, directory } = await fixture(t)
  const e = { self_id: bot.uin }
  const raw = await instance.signCard(e, cachedInput, rejectSign)
  const reordered = Object.fromEntries(Object.entries(cachedInput).toReversed())
  assert.equal(await instance.signCard(e, reordered, rejectSign), raw)
  assert.equal(cards.length, 1, '重复请求不得再次提交分享')
  for (const cleanup of instance.cleanup) {
    await cleanup.dispose()
    await cleanup.restore()
  }
  bot.pickFriend = () => {
    assert.fail('重建服务后应读取磁盘缓存')
  }
  assert.equal(await instance.signCard(e, cachedInput, rejectSign), raw)
  const files = await readdir(join(directory, 'data/music-card-cache'))
  assert.equal(files.length, 1)
  const stored = JSON.parse(
    await readFile(join(directory, 'data/music-card-cache', files[0]), 'utf8')
  )
  assert.equal(stored.raw, raw)
})

test('只有完全相同的请求才命中：空白、URL、平台、类型、缺省和扩展字段差异均重新签', async (t) => {
  const { instance, bot, cards } = await fixture(t)
  const e = { self_id: bot.uin }
  await instance.signCard(e, cachedInput, rejectSign)
  const withoutSinger = { ...cachedInput }
  delete withoutSinger.singer
  const variants = [
    { ...cachedInput, title: '缓存测试 ' },
    { ...cachedInput, singer: ' ' },
    { ...cachedInput, url: 'https://example.com/song?b=2&a=1' },
    { ...cachedInput, audio: 'https://example.com/audio.mp3?quality=high' },
    { ...cachedInput, image: 'https://example.com/cover.jpg' },
    { ...cachedInput, prompt: '[分享]缓存测试' },
    { ...cachedInput, type: 'qq' },
    { ...cachedInput, _platform: 'netease' },
    withoutSinger,
    { ...cachedInput, singer: null },
    { ...cachedInput, tags: { list: ['b', 'a'], count: '1' } },
    { ...cachedInput, tags: { list: ['a', 'b'], count: 1 } },
    { ...cachedInput, extraField: 'different' }
  ]
  for (const variant of variants) {
    const count = cards.length
    await instance.signCard(e, variant, rejectSign)
    assert.equal(cards.length, count + 1, '字段值或类型改变时不能复用原卡')
  }
})

test('损坏缓存不返回错误卡片，重新签成功后修复文件', async (t) => {
  const { instance, bot, cards, directory } = await fixture(t)
  const e = { self_id: bot.uin }
  await instance.signCard(e, cachedInput, rejectSign)
  const cacheDirectory = join(directory, 'data/music-card-cache')
  const [filename] = await readdir(cacheDirectory)
  const path = join(cacheDirectory, filename)
  const stored = JSON.parse(await readFile(path, 'utf8'))
  const wrong = JSON.parse(stored.raw)
  wrong.meta.music.title = '另一首歌'
  await writeFile(path, JSON.stringify({ ...stored, raw: JSON.stringify(wrong) }))
  const repaired = await instance.signCard(e, cachedInput, rejectSign)
  assert.equal(JSON.parse(repaired).meta.music.title, '缓存测试')
  assert.equal(cards.length, 2)
  await writeFile(path, '{broken')
  await instance.signCard(e, cachedInput, rejectSign)
  assert.equal(cards.length, 3)
})

test('云崽清理与恢复按顺序等待上一轮缓存写入', async (t) => {
  const { instance, bot } = await fixture(t)
  const entered = Promise.withResolvers()
  const release = Promise.withResolvers()
  const rename = fs.rename
  fs.rename = async (...args) => {
    entered.resolve()
    await release.promise
    return rename(...args)
  }
  let request, stopping, restarting
  try {
    request = instance.signCard({ self_id: bot.uin }, cachedInput, rejectSign)
    request.catch(() => {})
    await entered.promise
    const cleanup = instance.cleanup[0]
    stopping = cleanup.dispose()
    let restored = false
    restarting = cleanup.restore().then(() => {
      restored = true
    })
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(restored, false)
    release.resolve()
    await Promise.all([request, stopping, restarting])
    assert.equal(restored, true)
  } finally {
    release.resolve()
    fs.rename = rename
    await Promise.allSettled([request, stopping, restarting])
  }
})

test('开发者注册 ID 来源后通过音卡 Handler 查询，精确缓存命中不重复调用插件 API', async (t) => {
  const { instance, bot, cards, directory } = await fixture(t)
  const { registerMusicResolver } = await import(
    pathToFileURL(join(directory, 'lib/models/music-info.js'))
  )
  assert.equal(typeof registerMusicResolver, 'function')
  let queries = 0
  const dispose = registerMusicResolver('my-plugin', async (id) => {
    queries++
    assert.equal(id, 'track:00123')
    return {
      title: '开发者歌曲',
      singer: '开发者歌手',
      url: 'https://example.com/song',
      audio: 'https://example.com/song.mp3',
      image: ''
    }
  })
  t.after(dispose)
  const e = { self_id: bot.uin }
  const data = { type: 'my-plugin', id: 'track:00123' }
  const raw = await instance.signCard(e, data, rejectSign)
  assert.equal(JSON.parse(raw).meta.music.title, '开发者歌曲')
  assert.equal(JSON.parse(raw).meta.music.appid, 100497308, '自定义来源默认使用 QQ 音卡身份')
  assert.equal(await instance.signCard(e, data, rejectSign), raw)
  assert.equal(queries, 1)
  assert.equal(cards.length, 1)
  const platform = { appid: 200079, appname: 'com.sing.client', app_sign: '' }
  const custom = await instance.signCard(e, { ...data, _platform: platform }, rejectSign)
  assert.equal(JSON.parse(custom).meta.music.appid, 200079)
  assert.equal(queries, 2)
})

test('回传失败不写入缓存，音之测测绕过已有缓存检测当前回传能力', async (t) => {
  const { instance, bot, cards, directory } = await fixture(t, { timeoutMs: 25 })
  const normal = bot.pickFriend
  bot.pickFriend = () => ({ share: async () => {} })
  await assert.rejects(instance.signCard({ self_id: bot.uin }, cachedInput, rejectSign), /超时/)
  const files = await readdir(join(directory, 'data/music-card-cache')).catch((error) => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  assert.equal(files.length, 0)
  bot.pickFriend = normal
  const defaults = YAML.parse(
    await readFile(join(directory, 'resources/config/config.yaml'), 'utf8')
  )
  await instance.signCard({ self_id: bot.uin }, defaults.testMusic, rejectSign)
  await instance.signCard({ self_id: bot.uin }, defaults.testMusic, rejectSign)
  assert.equal(cards.length, 1)
  bot.pickFriend = () => ({
    share: async () => {
      throw new Error('当前回传不可用')
    }
  })
  const replies = []
  await instance.probe({
    self_id: bot.uin,
    msg: '#音之测测',
    reply: async (data) => {
      replies.push(data)
      return true
    }
  })
  assert.match(replies.at(-1), /音之测测失败.*当前回传不可用/)
})

test('主人设置签名 Bot 后配置持久保存，HTTP 和 Handler 立即使用新账号', async (t) => {
  const { instance, bot, stack, directory } = await fixture(t, { botId: '234567890' })
  const rule = instance.rule.find((entry) => entry.fnc === 'setBot')
  assert.equal(rule?.permission, 'master')
  assert.ok(new RegExp(rule.reg).test('#设置音乐签名Bot 123456789'))
  assert.ok(new RegExp(rule.reg).test('#设置音乐签名bot 自动'))
  const replies = []
  const reply = async (message) => {
    replies.push(message)
    return true
  }
  await instance.setBot({ msg: '#设置音乐签名Bot 123456789', reply })
  const saved = YAML.parse(
    await readFile(join(directory, '../../config/music-card-sign.yaml'), 'utf8')
  )
  assert.equal(saved.botId, String(bot.uin))
  const res = {
    writeHead(code) {
      this.statusCode = code
    },
    end(body) {
      this.body = body
    }
  }
  await stack[0].handle({ url: '/', method: 'POST', headers: {}, body: cachedInput }, res)
  assert.equal(res.statusCode, 200)
  assert.equal(JSON.parse(res.body).meta.music.title, cachedInput.title)
  await instance.signCard({ self_id: 987654321 }, cachedInput, rejectSign)
  await instance.status({ reply })
  assert.match(replies.at(-1), /签名 Bot：123456789/)
  await instance.setBot({ msg: '#设置音乐签名bot 自动', reply })
  assert.equal(
    YAML.parse(await readFile(join(directory, '../../config/music-card-sign.yaml'), 'utf8')).botId,
    ''
  )
  await instance.status({ reply })
  assert.match(replies.at(-1), /签名 Bot：自动选择/)
})

test('签名 Bot 指令提示用法，参数或保存失败时保留原账号', async (t) => {
  const { instance, directory } = await fixture(t, { botId: '123456789' })
  const replies = []
  const reply = async (message) => {
    replies.push(message)
    return true
  }
  await instance.setBot({ msg: '#设置音乐签名Bot', reply })
  assert.match(replies.at(-1), /用法/)
  await instance.setBot({ msg: '#设置音乐签名Bot abc', reply })
  assert.match(replies.at(-1), /Bot 号/)
  const write = fs.writeFile
  fs.writeFile = async () => {
    throw new Error('保存失败')
  }
  try {
    await instance.setBot({ msg: '#设置音乐签名Bot 234567890', reply })
    assert.match(replies.at(-1), /保存失败/)
    await instance.status({ reply })
    assert.match(replies.at(-1), /签名 Bot：123456789/)
  } finally {
    fs.writeFile = write
  }
  assert.equal(
    YAML.parse(await readFile(join(directory, '../../config/music-card-sign.yaml'), 'utf8')).botId,
    '123456789'
  )
})

test('首次升级迁移旧 JSON 配置并保留原文件', async (t) => {
  const legacy = {
    botId: '123456789',
    enabled: false,
    timeoutMs: 9876,
    testMusic: {
      type: 'custom',
      title: '旧测试',
      singer: '歌手',
      url: 'https://example.com/old',
      audio: 'https://example.com/old.mp3'
    }
  }
  const { instance, directory, stack } = await fixture(t, {}, { legacy })
  const saved = YAML.parse(
    await readFile(join(directory, '../../config/music-card-sign.yaml'), 'utf8')
  )
  assert.equal(saved.botId, legacy.botId)
  assert.equal(saved.timeoutMs, legacy.timeoutMs)
  assert.deepEqual(saved.testMusic, legacy.testMusic)
  assert.equal(stack.length, 0)
  assert.deepEqual(
    JSON.parse(await readFile(join(directory, 'config/config/config.json'), 'utf8')),
    legacy
  )
  const replies = []
  await instance.status({
    reply: async (message) => {
      replies.push(message)
    }
  })
  assert.match(replies[0], /签名 Bot：123456789/)
})

test('已有 YAML 时以 YAML 为准，不用旧 JSON 覆盖', async (t) => {
  const { directory } = await fixture(
    t,
    {},
    {
      legacy: { botId: '987654321', timeoutMs: 9876 },
      yaml: { botId: '123456789', timeoutMs: 15000 }
    }
  )
  const saved = YAML.parse(
    await readFile(join(directory, '../../config/music-card-sign.yaml'), 'utf8')
  )
  assert.equal(saved.botId, '123456789')
  assert.equal(saved.timeoutMs, 15000)
})
