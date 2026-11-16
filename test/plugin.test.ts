import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFile, writeFile, readdir } from 'node:fs/promises'
import fs from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type {
  CacheRecord,
  Config,
  MusicCard,
  MusicRequest,
  MusicEvent,
  ResolverContext
} from '../src/types'
import type * as MusicInfoModule from '../src/models/music-info'
import { fixture, command } from './helpers/plugin'
import type { FixtureCommandEvent, FixtureReply, FixtureResponse } from './helpers/plugin'
import YAML from 'yaml'

async function finishedWithin(promise: Promise<unknown>, timeoutMs = 1000) {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise.then(() => true),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs)
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}

for (const [scenario, source] of [
  ['缺少依赖', "import 'missing-music-card-test-dependency'"],
  ['导入抛错', "throw new Error('其他应用初始化失败')"],
  ['导入一直等待', 'await new Promise(() => {})']
] as const) {
  test(`应用加载按文件隔离，其他应用${scenario}不阻断启动和测试指令`, async (t) => {
    const loading = fixture(t, {}, { appFiles: { 'unrelated.js': source } })
    await assert.doesNotReject(async () => {
      assert.equal(await finishedWithin(loading, 6000), true, '其他应用不应拖住音卡加载')
    })
    const { instance, stack, cards, logs } = await loading
    assert.equal(stack.length, 3)
    assert.ok(
      logs.some(({ level, message }) => level === 'error' && message.includes('unrelated.js')),
      '失败日志应定位到具体文件'
    )
    assert.equal(await instance.probe(command('#音之测测')), true)
    assert.equal(cards.length, 1)
  })
}

test('应用加载保留同层有效插件，不扫描嵌套示例目录', async (t) => {
  const { directory, stack } = await fixture(
    t,
    {},
    {
      appFiles: {
        'additional.js': 'export class Additional extends plugin {}',
        'examples/unrelated.js': "throw new Error('示例目录不应被执行')"
      }
    }
  )
  const { apps } = (await import(pathToFileURL(join(directory, 'index.js')).href)) as {
    apps: Record<string, unknown>
  }
  assert.deepEqual(Object.keys(apps), ['Additional', 'MusicCardSign'])
  assert.equal(stack.length, 3)
})

test('音卡核心应用加载失败时保留原始错误，不返回空应用假装成功', async (t) => {
  await assert.rejects(
    fixture(
      t,
      {},
      {
        appFiles: {
          'music-card-sign.js':
            "export class MusicCardSign extends plugin {}; throw new Error('音卡核心依赖失败')"
        }
      }
    ),
    /音卡核心依赖失败/
  )
})

test('云崽 init 挂载服务，主人音卡命令直接发送捕获 JSON，卸载释放资源', async (t) => {
  const { instance, bot, stack, cards } = await fixture(t)
  const replies: FixtureReply[] = []
  const e: FixtureCommandEvent = {
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
  assert.equal(stack.length, 3)
  for (const cleanup of instance.cleanup) await cleanup.dispose()
  assert.equal(stack.length, 0)
  assert.equal(bot.listenerCount('sync.message'), 0)
  await Promise.all([
    instance.toggle(command('#开启音乐签名服务')),
    instance.toggle(command('#开启音乐签名服务'))
  ])
  assert.equal(stack.length, 3, '并发开启只能注册一条路由')
  await instance.toggle(command('#关闭音乐签名服务'))
  await Promise.all([
    instance.toggle(command('#开启音乐签名服务')),
    instance.toggle(command('#关闭音乐签名服务'))
  ])
  assert.equal(stack.length, 0, '后执行的关闭必须关闭并发启动的服务')
})

test('本次签名回包在 accept 终止后续识别，其他消息和分享照常分发', async (t) => {
  const { instance, bot, cards } = await fixture(t)
  let otherPluginCalls = 0
  const dispatch = (event: MusicEvent) => {
    if (instance.accept(event) !== 'return') otherPluginCalls++
  }
  // sync 和私聊回包可能是不同对象；私聊与其父级 message 共享事件。
  bot.on('message', dispatch)
  const pick = bot.pickFriend
  const echoes: MusicEvent[] = []
  bot.pickFriend = (id) => ({
    share: async (content, platform) => {
      await pick(id).share(content, platform)
      const event: MusicEvent = {
        message_id: `signed:${cards.length}`,
        self_id: bot.uin,
        from_id: bot.uin,
        to_id: id,
        message_type: 'private',
        message: [{ type: 'json', data: cards.at(-1) }]
      }
      echoes.push(event)
      bot.emit('message.private', event)
      bot.emit('message', event)
    }
  })
  await instance.probe(command('#音之测测'))
  assert.equal(otherPluginCalls, 0)
  assert.equal(instance.accept(echoes[0]), 'return')
  dispatch({
    self_id: bot.uin,
    from_id: 234567890,
    to_id: bot.uin,
    message: [{ type: 'json', data: cards[0] }]
  })
  dispatch({
    self_id: bot.uin,
    from_id: bot.uin,
    to_id: bot.uin,
    message: [{ type: 'text', data: '#音乐签名状态' }]
  })
  assert.equal(otherPluginCalls, 2)
  assert.equal(bot.listenerCount('message.private'), 0)
  assert.equal(bot.listenerCount('sync.message'), 0)
  assert.ok(instance.priority < 0, 'accept 必须在分享识别插件之前执行')
})

test('默认平台指令持久保存并立即用于 Handler，非法平台保留原配置', async (t) => {
  const { instance, cards, hostRoot } = await fixture(t)
  const rule = instance.rule.find((entry) => entry.fnc === 'setPlatform')
  assert.equal(rule?.permission, 'master')
  assert.ok(rule && new RegExp(rule.reg).test('#设置音乐签名平台 default'))
  const request = {
    type: 'custom',
    title: '平台测试',
    url: 'https://example.com/song',
    audio: 'https://example.com/song.mp3'
  }
  const replies: string[] = []
  const reply = async (message: string) => {
    replies.push(message)
    return true
  }
  await instance.setPlatform({ msg: '#设置音乐签名平台', reply })
  assert.match(replies.at(-1)!, /用法/)
  for (const [platform, appid] of [
    ['qq', 100497308],
    ['netease', 100495085],
    ['default', 102021671],
    ['qq', 100497308],
    ['default', 102021671]
  ] as const) {
    await instance.setPlatform({ msg: `#设置音乐签名平台 ${platform}`, reply })
    assert.match(replies.at(-1)!, new RegExp(`已设为 ${platform}`))
    const raw = await instance.signCard({}, request, rejectSign)
    assert.equal(JSON.parse(raw).meta.music.appid, appid)
    const yaml: Config = YAML.parse(
      await readFile(join(hostRoot, 'config/music-card-sign.yaml'), 'utf8')
    )
    assert.equal(yaml.defaultPlatform, platform)
  }
  for (const platform of ['不存在', 'txqq']) {
    await instance.setPlatform({ msg: `#设置音乐签名平台 ${platform}`, reply })
    assert.match(replies.at(-1)!, /设置失败.*未知音卡平台/)
  }
  const raw = await instance.signCard({}, request, rejectSign)
  assert.equal(JSON.parse(raw).meta.music.appid, 102021671)
  assert.equal(cards.length, 3, '切换默认平台隔离缓存，回到相同平台复用旧卡')
})

test('ICQQ 音卡直接使用 Bot SDK 发送到群聊或私聊，不经宿主 reply 加工', async (t) => {
  const { instance, bot, cards, logs } = await fixture(t)
  const sent: Array<{ kind: string; id: number; raw: string }> = []
  Object.assign(bot, {
    sendGroupMsg: async (id: number, message: { type: string; data: string }) => {
      assert.equal(message.type, 'json')
      sent.push({ kind: 'group', id, raw: message.data })
      return { message_id: 'group:1' }
    },
    sendPrivateMsg: async (id: number, message: { type: string; data: string }) => {
      assert.equal(message.type, 'json')
      sent.push({ kind: 'private', id, raw: message.data })
      return { message_id: 'private:1' }
    }
  })
  const replies: string[] = []
  const reply = async (message: FixtureReply) => {
    assert.equal(typeof message, 'string', '宿主 reply 只应收到测试进度文字')
    replies.push(String(message))
    return true
  }
  await instance.probe({
    self_id: bot.uin,
    group_id: '345678901',
    user_id: '234567890',
    msg: '#音之测测',
    reply
  })
  assert.deepEqual(sent, [{ kind: 'group', id: 345678901, raw: cards[0] }])
  assert.match(replies.at(-1)!, /音之测测通过/)
  await instance.probe({ self_id: bot.uin, user_id: '234567890', msg: '#音之测测', reply })
  assert.deepEqual(sent.at(-1), { kind: 'private', id: 234567890, raw: cards[1] })
  assert.ok(logs.some(({ message }) => /原生 SDK/.test(message)))
})

test('ICQQ SDK 发送失败报告原始错误，不再通过宿主 reply 重发卡片', async (t) => {
  const { instance, bot, logs } = await fixture(t)
  Object.assign(bot, {
    sendPrivateMsg: async () => {
      throw new Error('QQ JSON 风控拒绝')
    }
  })
  const replies: FixtureReply[] = []
  await instance.probe({
    self_id: bot.uin,
    user_id: '234567890',
    msg: '#音之测测',
    reply: async (message) => {
      replies.push(message)
      return true
    }
  })
  assert.match(String(replies.at(-1)), /当前会话发送.*QQ JSON 风控拒绝/)
  assert.ok(replies.every((message) => typeof message === 'string'))
  assert.ok(
    logs.some(({ level, message }) => level === 'error' && /QQ JSON 风控拒绝/.test(message))
  )
})

test('TRSS 未提供 addCleanup 时仍能初始化 API 并响应音之测测', async (t) => {
  const { instance, stack, cards, logs } = await fixture(t, {}, { noAddCleanup: true })
  assert.equal(instance.cleanup.length, 0)
  assert.equal(stack.length, 3)
  await instance.probe(command('#音之测测'))
  assert.equal(cards.length, 1)
  assert.ok(logs.some(({ message }) => message.includes('init 完成')))
  await instance.toggle(command('#关闭音乐签名服务'))
  assert.equal(stack.length, 0)
})

test('JiuLi onUnload 释放等待中的回传、监听器和 HTTP 路由', async (t) => {
  const { instance, bot, stack, logs } = await fixture(t, {}, { noAddCleanup: true })
  bot.pickFriend = () => ({ share: async () => {} })
  const probe = instance.probe(command('#音之测测'))
  while (!logs.some(({ message }) => message.includes('提交分享')))
    await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(bot.listenerCount('sync.message'), 1)
  await instance.onUnload()
  await probe
  assert.equal(stack.length, 0)
  assert.equal(bot.listenerCount('sync.message'), 0)
  assert.equal(bot.listenerCount('message.private'), 0)
})

test('音之测测使用默认歌曲，发送完整回包并报告耗时，命令要求主人权限', async (t) => {
  const { instance, bot, cards, directory } = await fixture(t)
  const rule = instance.rule.find((entry) => entry.fnc === 'probe')
  assert.equal(rule?.permission, 'master')
  assert.ok(rule)
  assert.ok(new RegExp(rule.reg).test('#音之测测'))
  assert.ok(new RegExp(rule.reg).test('音之测测'))
  const replies: FixtureReply[] = []
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
  assert.equal(JSON.parse(cards[0]).meta.music.appid, 100495085)
  assert.ok(typeof replies[0] === 'string')
  assert.match(replies[0], /音之测测开始/)
  assert.deepEqual(replies[1], { type: 'json', data: cards[0] })
  assert.ok(typeof replies[2] === 'string')
  assert.match(replies[2], /音之测测通过.*\d+ ms/)
  const userConfig: Config = YAML.parse(
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
  const replies: FixtureReply[] = []
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
  const result = replies.at(-1)
  assert.ok(typeof result === 'string')
  assert.match(result, /音之测测通过/)
})

test('音之测测在服务关闭或无在线 icqq 时报告生成失败', async (t) => {
  const { instance, bot, cards } = await fixture(t)
  const replies: FixtureReply[] = []
  const e: FixtureCommandEvent = {
    self_id: bot.uin,
    msg: '#音之测测',
    reply: async (data) => {
      replies.push(data)
      return true
    }
  }
  bot.isOnline = () => false
  await instance.probe(e)
  const offlineReply = replies.at(-1)
  assert.ok(typeof offlineReply === 'string')
  assert.match(offlineReply, /音之测测失败.*生成\/回传.*在线 icqq/)
  await instance.toggle({ msg: '#关闭音乐签名服务', reply: async () => true })
  await instance.probe(e)
  const disabledReply = replies.at(-1)
  assert.ok(typeof disabledReply === 'string')
  assert.match(disabledReply, /音之测测失败.*未开启/)
  assert.equal(cards.length, 0)
})

test('音之测测报告回传超时，等待项释放后仍可继续测试', async (t) => {
  const { instance, bot } = await fixture(t, { timeoutMs: 25 })
  const replies: FixtureReply[] = []
  const normal = bot.pickFriend
  bot.pickFriend = () => ({ share: async () => {} })
  const e: FixtureCommandEvent = {
    self_id: bot.uin,
    msg: '#音之测测',
    reply: async (data) => {
      replies.push(data)
      return { message_id: [1], error: [] }
    }
  }
  await instance.probe(e)
  const timeoutReply = replies.at(-1)
  assert.ok(typeof timeoutReply === 'string')
  assert.match(timeoutReply, /音之测测失败.*生成\/回传.*超时/)
  await instance.status(e)
  const statusReply = replies.at(-1)
  assert.ok(typeof statusReply === 'string')
  assert.match(statusReply, /等待请求：0/)
  bot.pickFriend = normal
  await instance.probe(e)
  const successReply = replies.at(-1)
  assert.ok(typeof successReply === 'string')
  assert.match(successReply, /音之测测通过/)
})

test('音之测测区分当前会话 JSON 发送失败，不误报通过', async (t) => {
  const { instance, bot } = await fixture(t)
  const replies: FixtureReply[] = []
  await instance.probe({
    self_id: bot.uin,
    msg: '#音之测测',
    reply: async (data) => {
      replies.push(data)
      return typeof data === 'object' ? { error: ['JSON unsupported'] } : true
    }
  })
  assert.ok(typeof replies[1] === 'object')
  assert.equal(replies[1].type, 'json')
  assert.ok(typeof replies[2] === 'string')
  assert.match(replies[2], /音之测测失败.*当前会话发送.*发送失败/)
  assert.ok(!replies.some((data) => typeof data === 'string' && data.includes('通过')))
})

test('OneBot v11 会话自动选择 icqq 签名，发送符合协议的完整 JSON 而非二次序列化', async (t) => {
  const { instance, bot, cards, logs } = await fixture(t)
  const replies: FixtureReply[] = []
  await instance.probe({
    self_id: 987654321,
    bot: { adapter: { name: 'OneBotv11' } },
    msg: '#音之测测',
    reply: async (message) => {
      replies.push(message)
      return { message_id: [1], error: [] }
    }
  })
  assert.equal(cards.length, 1, '会话账号不能覆盖自动选择的 icqq 签名账号')
  assert.ok(typeof replies[0] === 'string')
  assert.match(replies[0], /音之测测开始/)
  const expected = { type: 'json', data: { data: cards[0] } }
  assert.deepEqual(replies[1], { type: 'raw', data: expected })
  // 用户补丁会在 data.data 已存在时保留原文；OneBot 接口收到的必须是对象。
  assert.equal(JSON.parse(expected.data.data).meta.music.title, '晴天')
  assert.ok(logs.some(({ message }) => message.includes('OneBotv11')))
  assert.ok(logs.some(({ message }) => message.includes(`Bot=${bot.uin}`)))
  assert.ok(logs.some(({ message }) => message.includes('提交分享')))
  assert.ok(logs.some(({ message }) => message.includes('回传匹配')))
  assert.ok(logs.some(({ message }) => message.includes('发送成功')))
})

test('OneBot v11 群聊和私聊由配置的 icqq 签名，再由收指令账号发送原卡', async (t) => {
  const { instance, bot, cards, targets, logs } = await fixture(t, { botId: '123456789' })
  const receiverId = 234567890
  Object.assign(Bot, {
    uin: [receiverId, bot.uin],
    [receiverId]: { adapter: { name: 'OneBotv11' } }
  })
  Object.assign(bot, {
    sendGroupMsg: async () => assert.fail('签名账号不能替 OneBot 会话发送群消息'),
    sendPrivateMsg: async () => assert.fail('签名账号不能替 OneBot 会话发送私聊消息')
  })
  const sessions = [{ group_id: '345678901', user_id: '456789012' }, { user_id: '456789012' }]
  const music = {
    type: 'custom',
    _platform: '163',
    title: '跨账号音卡',
    url: 'https://example.com/song',
    audio: 'https://example.com/audio.mp3'
  }
  for (const [index, session] of sessions.entries()) {
    const replies: FixtureReply[] = []
    await instance.probe({
      self_id: receiverId,
      ...session,
      msg: '#音之测测 ' + JSON.stringify(music),
      reply: async (message) => {
        replies.push(message)
        return { message_id: [1], error: [] }
      }
    })
    assert.equal(cards.length, index + 1)
    assert.deepEqual(replies[1], {
      type: 'raw',
      data: { type: 'json', data: { data: cards[index] } }
    })
    assert.equal(JSON.parse(cards[index]).meta.music.appid, 100495085)
    assert.match(String(replies.at(-1)), /音之测测通过/)
  }
  assert.deepEqual(targets, [bot.uin, bot.uin])
  assert.ok(
    logs.some(({ message }) => message.includes(`[音卡发送] Bot=${receiverId} 适配器=OneBotv11`))
  )
})

test('另一个 ICQQ 账号收到指令时，由它的 SDK 发回配置账号签好的原卡', async (t) => {
  const { instance, bot, cards, targets } = await fixture(t, { botId: '123456789' })
  const receiverId = 234567890
  const sent: Array<{ kind: string; id: number; raw: string }> = []
  const receiver = Object.assign(new EventEmitter(), {
    uin: receiverId,
    isOnline: () => true,
    pickFriend: () => assert.fail('收到指令的账号不能覆盖配置的签名账号'),
    sendGroupMsg: async (id: number, message: { type: string; data: string }) => {
      assert.equal(message.type, 'json')
      sent.push({ kind: 'group', id, raw: message.data })
      return { message_id: 'group:1' }
    },
    sendPrivateMsg: async (id: number, message: { type: string; data: string }) => {
      assert.equal(message.type, 'json')
      sent.push({ kind: 'private', id, raw: message.data })
      return { message_id: 'private:1' }
    }
  })
  Object.assign(Bot, {
    uin: [receiverId, bot.uin],
    [receiverId]: { adapter: { name: 'ICQQ' }, sdk: receiver }
  })
  const replies: string[] = []
  const reply = async (message: FixtureReply) => {
    assert.equal(typeof message, 'string', 'ICQQ 原卡应通过收指令账号的 SDK 发送')
    replies.push(String(message))
    return true
  }
  await instance.probe({
    self_id: receiverId,
    group_id: '345678901',
    user_id: '456789012',
    msg: '#音之测测',
    reply
  })
  assert.match(replies.at(-1)!, /音之测测通过/)
  await instance.probe({
    self_id: receiverId,
    user_id: '456789012',
    msg: '#音之测测',
    reply
  })
  assert.match(replies.at(-1)!, /音之测测通过/)
  assert.equal(cards.length, 2)
  assert.deepEqual(targets, [bot.uin, bot.uin])
  assert.deepEqual(sent, [
    { kind: 'group', id: 345678901, raw: cards[0] },
    { kind: 'private', id: 456789012, raw: cards[1] }
  ])
})

test('音之测测在等待回传前响应，并记录超时和释放等待项', async (t) => {
  const { instance, bot, logs } = await fixture(t, { timeoutMs: 25 })
  const replies: FixtureReply[] = []
  bot.pickFriend = () => ({
    share: async () => {
      assert.ok(typeof replies[0] === 'string')
      assert.match(replies[0], /音之测测开始/)
    }
  })
  await instance.probe({
    self_id: bot.uin,
    msg: '音之测测',
    reply: async (message) => {
      replies.push(message)
      return true
    }
  })
  assert.ok(logs.some(({ level, message }) => level === 'error' && message.includes('超时')))
  assert.equal(bot.listenerCount('sync.message'), 0)
  const reply = replies.at(-1)
  assert.ok(typeof reply === 'string')
  assert.match(reply, /生成\/回传.*超时/)
})

test('OneBot 开始通知没有回执时仍进入签名并发送音卡', async (t) => {
  const { instance, cards, logs } = await fixture(t, { timeoutMs: 25 })
  const replies: FixtureReply[] = []
  const notice = Promise.withResolvers<true>()
  const sending = instance.probe({
    bot: { adapter: { name: 'OneBotv11' } },
    msg: '#音之测测',
    reply: async (message) => {
      replies.push(message)
      if (typeof message === 'string' && message.includes('音之测测开始')) return notice.promise
      return { message_id: [1], error: [] }
    }
  })
  const finished = await finishedWithin(sending)
  const completed = cards.length === 1 && replies.some((message) => typeof message === 'object')
  notice.resolve(true)
  assert.equal(await sending, true)
  assert.equal(finished, true)
  assert.equal(completed, true, '开始通知回执不应阻塞签名或发卡')
  assert.ok(logs.some(({ message }) => /Handler 收到请求/.test(message)))
  assert.ok(logs.some(({ message }) => /读取测试配置/.test(message)))
})

test('测试开始通知抛错时仍签名，错误写入通知日志', async (t) => {
  const { instance, cards, logs } = await fixture(t)
  await instance.probe({
    msg: '#音之测测',
    reply: async (message) => {
      if (typeof message === 'string' && message.includes('音之测测开始'))
        throw new Error('开始通知发送失败')
      return true
    }
  })
  assert.equal(cards.length, 1)
  assert.ok(logs.some(({ level, message }) => level === 'warn' && /开始通知发送失败/.test(message)))
  assert.ok(logs.some(({ message }) => /发送成功/.test(message)))
})

test('音卡发送及失败通知无回执时有等待上限，迟到的失败不会误报通过', async (t) => {
  const { instance, logs } = await fixture(t, { timeoutMs: 25 })
  const cardReply = Promise.withResolvers<true>()
  const failureReply = Promise.withResolvers<true>()
  const replies: FixtureReply[] = []
  const sending = instance.probe({
    bot: { adapter: { name: 'OneBotv11' } },
    msg: '#音之测测',
    reply: async (message) => {
      replies.push(message)
      if (typeof message === 'object') return cardReply.promise
      if (message.includes('音之测测失败')) return failureReply.promise
      return true
    }
  })
  const finished = await finishedWithin(sending)
  const reported = logs.some(({ message }) => /发送失败.*回执.*超时/.test(message))
  const noticeTimedOut = logs.some(({ message }) => /通知.*回执.*超时/.test(message))
  cardReply.reject(new Error('迟到的协议错误'))
  failureReply.resolve(true)
  assert.equal(await sending, true)
  assert.equal(finished, true)
  assert.equal(reported, true)
  assert.equal(noticeTimedOut, true)
  assert.ok(!logs.some(({ message }) => /发送成功/.test(message)))
  assert.ok(!replies.some((message) => typeof message === 'string' && message.includes('通过')))
})

test('测试成功通知无回执时也能结束，保留成功日志', async (t) => {
  const { instance, logs } = await fixture(t, { timeoutMs: 25 })
  const notice = Promise.withResolvers<true>()
  const sending = instance.probe({
    msg: '#音之测测',
    reply: async (message) => {
      if (typeof message === 'string' && message.includes('音之测测通过')) return notice.promise
      return true
    }
  })
  const finished = await finishedWithin(sending)
  const timedOut = logs.some(({ message }) => /通知.*回执.*超时/.test(message))
  notice.resolve(true)
  assert.equal(await sending, true)
  assert.equal(finished, true)
  assert.equal(timedOut, true)
  assert.ok(logs.some(({ message }) => /音之测测通过/.test(message)))
})

test('ICQQ 原生 SDK 发卡没有回执时同样报告发送超时', async (t) => {
  const { instance, bot, logs } = await fixture(t, { timeoutMs: 25 })
  const cardReply = Promise.withResolvers<{ message_id: string }>()
  let submissions = 0
  Object.assign(bot, {
    sendPrivateMsg: () => {
      submissions++
      return cardReply.promise
    }
  })
  const replies: FixtureReply[] = []
  const sending = instance.probe({
    self_id: bot.uin,
    user_id: '234567890',
    msg: '#音之测测',
    reply: async (message) => {
      replies.push(message)
      return true
    }
  })
  const finished = await finishedWithin(sending)
  const reported = replies.some(
    (message) => typeof message === 'string' && /当前会话发送.*回执.*超时/.test(message)
  )
  cardReply.resolve({ message_id: 'late:1' })
  assert.equal(await sending, true)
  assert.equal(finished, true)
  assert.equal(reported, true)
  assert.equal(submissions, 1)
  assert.ok(!logs.some(({ message }) => /发送成功/.test(message)))
  assert.ok(!replies.some((message) => typeof message === 'object'))
})

test('发送失败记录协议端原始错误，失败回复包含详情', async (t) => {
  const { instance, bot, logs } = await fixture(t)
  const replies: FixtureReply[] = []
  await instance.probe({
    self_id: bot.uin,
    bot: { adapter: { name: 'OneBotv11' } },
    msg: '#音之测测',
    reply: async (message) => {
      replies.push(message)
      return typeof message === 'object' ? { error: ['retcode=100: JSON unsupported'] } : true
    }
  })
  const reply = replies.at(-1)
  assert.ok(typeof reply === 'string')
  assert.match(reply, /当前会话发送.*retcode=100: JSON unsupported/)
  assert.ok(logs.some(({ level, message }) => level === 'error' && message.includes('retcode=100')))
  assert.ok(!logs.some(({ message }) => message.includes('发送成功')))
})

test('未支持的会话适配器明确报告，不能假报音卡发送成功', async (t) => {
  const { instance, bot } = await fixture(t)
  const replies: FixtureReply[] = []
  await instance.probe({
    self_id: bot.uin,
    bot: { adapter: { name: 'QQBot' } },
    msg: '#音之测测',
    reply: async (message) => {
      replies.push(message)
      return true
    }
  })
  const reply = replies.at(-1)
  assert.ok(typeof reply === 'string')
  assert.match(reply, /当前会话发送.*QQBot/)
  assert.equal(replies.filter((message) => typeof message === 'object').length, 0)
})

const cachedInput: MusicRequest = {
  type: 'custom',
  title: '缓存测试',
  singer: '',
  url: 'https://example.com/song?a=1&b=2',
  audio: 'https://example.com/audio.mp3',
  image: '',
  tags: { list: ['a', 'b'], count: '1' }
}
const rejectSign = (message: string): never => {
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
  const stored: CacheRecord = JSON.parse(
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
  const variants: MusicRequest[] = [
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
  const stored: CacheRecord = JSON.parse(await readFile(path, 'utf8'))
  const wrong: MusicCard = JSON.parse(stored.raw)
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
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const rename = fs.rename
  fs.rename = async (...args) => {
    entered.resolve()
    await release.promise
    return rename(...args)
  }
  let request: Promise<string> | undefined
  let stopping: Promise<void> | undefined
  let restarting: Promise<void> | undefined
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
    await new Promise<void>((resolve) => setImmediate(resolve))
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
  const { registerMusicResolver } = (await import(
    pathToFileURL(join(directory, 'lib/models/music-info.js')).href
  )) as typeof MusicInfoModule
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
  assert.equal(JSON.parse(raw).meta.music.appid, 102021671, '自定义来源使用配置的默认音卡身份')
  assert.equal(await instance.signCard(e, data, rejectSign), raw)
  assert.equal(queries, 1)
  assert.equal(cards.length, 1)
  const platform = { appid: 200079, appname: 'com.sing.client', app_sign: '' }
  const custom = await instance.signCard(e, { ...data, _platform: platform }, rejectSign)
  assert.equal(JSON.parse(custom).meta.music.appid, 200079)
  assert.equal(queries, 2)
})

test('按来源调用歌曲查询 Handler，共用 HTTP 与精确缓存，移除后恢复直接注册来源', async (t) => {
  const { instance, bot, cards, directory, handlers, stack } = await fixture(t)
  const { registerMusicResolver } = (await import(
    pathToFileURL(join(directory, 'lib/models/music-info.js')).href
  )) as typeof MusicInfoModule
  const info = {
    title: 'Handler 歌曲',
    singer: 'Handler 歌手',
    url: 'https://example.com/song',
    audio: 'https://example.com/audio.mp3'
  }
  const unregister = registerMusicResolver('my-plugin', () => ({ ...info, title: '直接注册歌曲' }))
  t.after(unregister)
  let queries = 0
  let context: ResolverContext | undefined
  handlers.add({
    key: 'music.info.my-plugin',
    ns: 'example/music-source.js',
    fn: (received, data) => {
      queries++
      context = received
      assert.equal(data.id, 'track:00123')
      assert.equal(data.type, 'my-plugin')
      assert.equal(received.type, data.type)
      assert.equal(received.signal.aborted, false)
      assert.equal(typeof received.json, 'function')
      return info
    }
  })
  const data = { type: 'my-plugin', id: 'track:00123' }
  const raw = await instance.signCard({ self_id: bot.uin }, data, rejectSign)
  assert.equal(JSON.parse(raw).meta.music.title, info.title)
  assert.equal(context?.signal.aborted, true)
  assert.equal(await instance.signCard({ self_id: bot.uin }, data, rejectSign), raw)
  assert.equal(queries, 1)
  assert.equal(cards.length, 1)
  const response: FixtureResponse = {
    statusCode: 0,
    body: '',
    writeHead(code) {
      this.statusCode = code
    },
    end(body) {
      this.body = body
    }
  }
  await stack[1].handle(
    { method: 'POST', url: '/', headers: {}, body: { ...data, prompt: 'HTTP 查询' } },
    response
  )
  assert.equal(response.statusCode, 200)
  assert.equal(JSON.parse(response.body).meta.music.title, info.title)
  assert.equal(queries, 2)
  handlers.del('example/music-source.js')
  const fallback = await instance.signCard({}, { ...data, prompt: '卸载后的查询' }, rejectSign)
  assert.equal(JSON.parse(fallback).meta.music.title, '直接注册歌曲')
  assert.equal(queries, 2)
  unregister()
  await assert.rejects(
    instance.signCard({}, { ...data, prompt: '来源已卸载' }, rejectSign),
    /未注册该音乐来源/
  )
})

test('歌曲查询 Handler 的错误、无效字段和超时在提交前失败，超时中止查询信号', async (t) => {
  const { instance, bot, cards, handlers } = await fixture(t, { timeoutMs: 25 })
  const entry = { key: 'music.info.handler-test', ns: 'example/handler-test.js' }
  const data = { type: 'handler-test', id: 'track:00123' }
  handlers.add({
    ...entry,
    fn: () => {
      throw new Error('开发者 API 查询失败')
    }
  })
  await assert.rejects(instance.signCard({}, data, rejectSign), /开发者 API 查询失败/)
  handlers.add({
    ...entry,
    fn: () => ({ title: '测试', singer: '歌手', url: 'https://example.com/song', audio: '' })
  })
  await assert.rejects(instance.signCard({}, data, rejectSign), /可用音频 URL/)
  let signal: AbortSignal | undefined
  handlers.add({
    ...entry,
    fn: (context) => {
      signal = context.signal
      return new Promise(() => {})
    }
  })
  await assert.rejects(instance.signCard({}, data, rejectSign), /解析超时/)
  assert.equal(signal?.aborted, true)
  assert.equal(cards.length, 0)
  assert.equal(bot.listenerCount('sync.message'), 0)
  assert.equal(bot.listenerCount('message.private'), 0)
})

test('回传失败不写入缓存，音之测测绕过已有缓存检测当前回传能力', async (t) => {
  const { instance, bot, cards, directory } = await fixture(t, { timeoutMs: 25 })
  const normal = bot.pickFriend
  bot.pickFriend = () => ({ share: async () => {} })
  await assert.rejects(instance.signCard({ self_id: bot.uin }, cachedInput, rejectSign), /超时/)
  const files = await readdir(join(directory, 'data/music-card-cache')).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return []
      throw error
    }
  )
  assert.equal(files.length, 0)
  bot.pickFriend = normal
  const defaults: Config = YAML.parse(
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
  const replies: FixtureReply[] = []
  await instance.probe({
    self_id: bot.uin,
    msg: '#音之测测',
    reply: async (data) => {
      replies.push(data)
      return true
    }
  })
  const result = replies.at(-1)
  assert.ok(typeof result === 'string')
  assert.match(result, /音之测测失败.*当前回传不可用/)
})

test('主人设置签名 Bot 后配置持久保存，HTTP 和 Handler 立即使用新账号', async (t) => {
  const { instance, bot, stack, directory } = await fixture(t, { botId: '234567890' })
  const rule = instance.rule.find((entry) => entry.fnc === 'setBot')
  assert.equal(rule?.permission, 'master')
  assert.ok(rule)
  assert.ok(new RegExp(rule.reg).test('#设置音乐签名Bot 123456789'))
  assert.ok(new RegExp(rule.reg).test('#设置音乐签名bot 自动'))
  const replies: string[] = []
  const reply = async (message: string) => {
    replies.push(message)
    return true
  }
  await instance.setBot({ msg: '#设置音乐签名Bot 123456789', reply })
  const saved: Config = YAML.parse(
    await readFile(join(directory, '../../config/music-card-sign.yaml'), 'utf8')
  )
  assert.equal(saved.botId, String(bot.uin))
  const res: FixtureResponse = {
    statusCode: 0,
    body: '',
    writeHead(code) {
      this.statusCode = code
    },
    end(body) {
      this.body = body
    }
  }
  await stack[1].handle({ url: '/', method: 'POST', headers: {}, body: cachedInput }, res)
  assert.equal(res.statusCode, 200)
  assert.equal(JSON.parse(res.body).meta.music.title, cachedInput.title)
  await instance.signCard({ self_id: 987654321 }, cachedInput, rejectSign)
  await instance.status({ reply })
  assert.match(replies.at(-1)!, /签名 Bot：123456789/)
  await instance.setBot({ msg: '#设置音乐签名bot 自动', reply })
  assert.equal(
    YAML.parse(await readFile(join(directory, '../../config/music-card-sign.yaml'), 'utf8')).botId,
    ''
  )
  await instance.status({ reply })
  assert.match(replies.at(-1)!, /签名 Bot：自动选择/)
})

test('签名 Bot 指令提示用法，参数或保存失败时保留原账号', async (t) => {
  const { instance, directory } = await fixture(t, { botId: '123456789' })
  const replies: string[] = []
  const reply = async (message: string) => {
    replies.push(message)
    return true
  }
  await instance.setBot({ msg: '#设置音乐签名Bot', reply })
  assert.match(replies.at(-1)!, /用法/)
  await instance.setBot({ msg: '#设置音乐签名Bot abc', reply })
  assert.match(replies.at(-1)!, /Bot 号/)
  const write = fs.writeFile
  fs.writeFile = async () => {
    throw new Error('保存失败')
  }
  try {
    await instance.setBot({ msg: '#设置音乐签名Bot 234567890', reply })
    assert.match(replies.at(-1)!, /保存失败/)
    await instance.status({ reply })
    assert.match(replies.at(-1)!, /签名 Bot：123456789/)
  } finally {
    fs.writeFile = write
  }
  assert.equal(
    YAML.parse(await readFile(join(directory, '../../config/music-card-sign.yaml'), 'utf8')).botId,
    '123456789'
  )
})

test('联系人指令保存配置，音之测测使用新联系人并可恢复发给自己', async (t) => {
  const { instance, bot, targets, logs, hostRoot, stack } = await fixture(t)
  const rule = instance.rule.find((entry) => entry.fnc === 'setTarget')
  assert.equal(rule?.permission, 'master')
  assert.ok(rule)
  assert.ok(new RegExp(rule.reg).test('#设置音乐签名联系人 987654321'))
  const replies: string[] = []
  const reply = async (message: string) => {
    replies.push(message)
  }
  const configPath = join(hostRoot, 'config/music-card-sign.yaml')
  await instance.setTarget({ msg: '#设置音乐签名联系人 987654321', reply })
  assert.match(replies.at(-1)!, /已设为 987654321/)
  assert.equal(YAML.parse(await readFile(configPath, 'utf8')).targetId, '987654321')
  await instance.probe(command('#音之测测'))
  assert.deepEqual(targets, [987654321])
  assert.ok(logs.some(({ message }) => /接收 QQ=987654321.*提交分享/.test(message)))
  await instance.status({ reply })
  assert.match(replies.at(-1)!, /接收联系人：987654321/)
  const write = fs.writeFile
  fs.writeFile = async () => {
    throw new Error('保存失败')
  }
  try {
    await instance.setTarget({ msg: '#设置音乐签名联系人 自己', reply })
    assert.match(replies.at(-1)!, /保存失败/)
  } finally {
    fs.writeFile = write
  }
  await instance.probe(command('#音之测测'))
  assert.deepEqual(targets, [987654321, 987654321])
  await instance.setTarget({ msg: '#设置音乐签名联系人', reply })
  assert.match(replies.at(-1)!, /用法/)
  await instance.setTarget({ msg: '#设置音乐签名联系人 abc', reply })
  assert.match(replies.at(-1)!, /联系人.*QQ/)
  await instance.setTarget({ msg: '#设置音乐签名联系人 自己', reply })
  assert.equal(YAML.parse(await readFile(configPath, 'utf8')).targetId, '')
  await instance.probe(command('#音之测测'))
  assert.equal(targets.at(-1), bot.uin)
  assert.equal(stack.length, 3)
  assert.equal(bot.listenerCount('sync.message'), 0)
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
  const saved: Config = YAML.parse(
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
  const replies: string[] = []
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
  const saved: Config = YAML.parse(
    await readFile(join(directory, '../../config/music-card-sign.yaml'), 'utf8')
  )
  assert.equal(saved.botId, '123456789')
  assert.equal(saved.timeoutMs, 15000)
})

for (const source of ['yaml', 'legacy'] as const) {
  test(`${source} 中的旧内置 txqq 默认平台自动迁移并保存，Handler 使用新平台`, async (t) => {
    const settings = { defaultPlatform: ' TxQq ', timeoutMs: 9876, botId: '123456789' }
    const { instance, directory, hostRoot, stack } = await fixture(t, {}, { [source]: settings })
    const saved: Config = YAML.parse(
      await readFile(join(hostRoot, 'config/music-card-sign.yaml'), 'utf8')
    )
    assert.equal(saved.defaultPlatform, 'default')
    assert.equal(saved.timeoutMs, settings.timeoutMs)
    assert.equal(saved.botId, settings.botId)
    assert.equal(stack.length, 3)
    const raw = await instance.signCard({}, cachedInput, rejectSign)
    assert.equal(JSON.parse(raw).meta.music.appid, 102021671)
    if (source === 'legacy') {
      assert.deepEqual(
        JSON.parse(await readFile(join(directory, 'config/config/config.json'), 'utf8')),
        settings
      )
    }
  })
}

test('用户自定义 txqq 平台保留映射和默认设置', async (t) => {
  const settings = { defaultPlatform: 'txqq', platforms: { txqq: { appid: 200079 } } }
  const { instance, hostRoot } = await fixture(t, {}, { yaml: settings })
  const saved: Config = YAML.parse(
    await readFile(join(hostRoot, 'config/music-card-sign.yaml'), 'utf8')
  )
  assert.equal(saved.defaultPlatform, settings.defaultPlatform)
  assert.deepEqual(saved.platforms, settings.platforms)
  const raw = await instance.signCard({}, cachedInput, rejectSign)
  assert.equal(JSON.parse(raw).meta.music.appid, 200079)
})
