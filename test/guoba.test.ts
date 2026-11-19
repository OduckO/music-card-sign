import { test } from 'node:test'
import type { TestContext } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import YAML from 'yaml'
import { Trapper } from 'triptrap'
import type { Result } from 'trss-yunzai/guoba'
import type { supportGuoba } from '../src/modules/guoba'
import type ConfigModule from '../src/config'
import type { Config } from '../src/types'
import { selectPlatform } from '../src/models/music-sign'
import { fixture, command } from './helpers/plugin'
import type { FixtureReply, FixtureResponse } from './helpers/plugin'

class GuobaResult<T> implements Result<T> {
  constructor(
    public code: number,
    public result: T | null,
    public message: string,
    public httpStatus = 200
  ) {}

  static ok<T>(result: T, message = '') {
    return new GuobaResult(0, result, message)
  }

  static error<T>(...args: [number | string, (T | null)?, string?, number?]) {
    const [code, result = null, message = '', status = 400] = args
    return new GuobaResult(
      typeof code === 'number' ? code : 1,
      result,
      typeof code === 'string' ? code : message,
      status
    )
  }

  get isOk() {
    return this.code === 0
  }

  toJSON() {
    return { ok: this.isOk, code: this.code, result: this.result, message: this.message }
  }
}

const context = { Result: GuobaResult }

test('锅巴可先于应用加载，读取配置不依赖全局插件类且不会提前启动服务', async (t) => {
  const { directory } = await fixture(t, {}, { guobaFirst: true })
  const module = await import(pathToFileURL(join(directory, 'guoba.support.js')).href + '?reload')
  assert.equal(typeof module.supportGuoba, 'function')
  assert.equal(module.supportGuoba().configInfo.getConfigData().enabled, true)
})

async function guobaFixture(t: TestContext) {
  const host = await fixture(t)
  const module = (await import(pathToFileURL(join(host.directory, 'guoba.support.js')).href)) as {
    supportGuoba: typeof supportGuoba
  }
  return {
    ...host,
    guoba: module.supportGuoba(),
    configPath: join(host.hostRoot, 'config/music-card-sign.yaml')
  }
}

test('锅巴 Bot 名单多选覆盖所有在线适配器，模式说明和空白名单提醒完整，切换立即生效', async (t) => {
  const { guoba: firstGuoba, bot, testApp, configPath, logs } = await guobaFixture(t)
  const receiverId = '345678901'
  Object.assign(Bot, {
    uin: [bot.uin, Number(receiverId), 456789012],
    [receiverId]: { nickname: '转发账号', adapter: { name: 'OneBotv11' }, online: true },
    [456789012]: { nickname: '离线账号', adapter: { name: 'OneBotv11' }, online: false }
  })
  assert.equal(
    (await firstGuoba.configInfo.setConfigData({ commandBotBlacklist: ['567890123'] }, context))
      .isOk,
    true
  )
  const info = firstGuoba.configInfo
  const modeSchema = info.schemas.find(({ field }) => field === 'commandBotMode')
  assert.equal(modeSchema?.component, 'Select')
  assert.match(String(modeSchema?.bottomHelpMessage), /关闭限制.*黑名单.*白名单/s)
  assert.match(String(modeSchema?.bottomHelpMessage), /只有当前模式生效/)
  for (const field of ['commandBotBlacklist', 'commandBotWhitelist'] as const) {
    const schema = info.schemas.find((item) => item.field === field)
    assert.equal(schema?.component, 'Select')
    assert.partialDeepStrictEqual(schema?.componentProps, {
      mode: 'multiple',
      showSearch: true,
      optionFilterProp: 'label',
      options: [
        { value: String(bot.uin), label: '签名账号 · ICQQ（123456789）' },
        { value: receiverId, label: '转发账号 · OneBotv11（345678901）' },
        ...(field === 'commandBotBlacklist'
          ? [{ value: '567890123', label: '567890123（当前不在线）' }]
          : [])
      ]
    })
  }
  const whitelistSchema = info.schemas.find(({ field }) => field === 'commandBotWhitelist')
  assert.match(String(whitelistSchema?.label), /空名单会全部静默/)
  assert.match(String(whitelistSchema?.bottomHelpMessage), /特别注意.*包括帮助和设置.*关闭限制/)

  const replies: FixtureReply[] = []
  const event = {
    ...command('#音之测测'),
    self_id: bot.uin,
    reply: async (message: FixtureReply) => {
      replies.push(message)
      return true
    }
  }
  assert.equal(
    (
      await info.setConfigData(
        {
          commandBotMode: 'whitelist',
          commandBotBlacklist: [bot.uin, ` ${bot.uin} `],
          commandBotWhitelist: []
        },
        context
      )
    ).isOk,
    true
  )
  await testApp.probe(event)
  assert.equal(replies.length, 0)
  assert.ok(logs.some(({ message }) => /白名单为空.*加入白名单.*关闭限制/.test(message)))
  assert.equal((await info.setConfigData({ commandBotWhitelist: [bot.uin] }, context)).isOk, true)
  await testApp.probe(event)
  assert.match(String(replies.at(-1)), /音之测测通过/)
  assert.equal((await info.setConfigData({ commandBotMode: 'blacklist' }, context)).isOk, true)
  const before = replies.length
  await testApp.probe(event)
  assert.equal(replies.length, before)
  assert.equal((await info.setConfigData({ commandBotMode: 'off' }, context)).isOk, true)
  await testApp.probe(event)
  assert.match(String(replies.at(-1)), /音之测测通过/)
  const yaml: Config = YAML.parse(await readFile(configPath, 'utf8'))
  assert.equal(yaml.commandBotMode, 'off')
  assert.deepEqual(yaml.commandBotBlacklist, [String(bot.uin)])
  assert.deepEqual(yaml.commandBotWhitelist, [String(bot.uin)])
  assert.deepEqual(info.getConfigData().commandBotWhitelist, yaml.commandBotWhitelist)
})

test('锅巴保存取消 triptrap 等待请求，只释放插件自己的监听并能继续签名', async (t) => {
  const { guoba, bot, instance, stack, configPath, testApp } = await guobaFixture(t)
  const events = new Trapper()
  let hostEvents = 0
  const hostListener = () => hostEvents++
  const disposeHost = events.trap('sync.message', hostListener)
  t.after(disposeHost)
  Object.assign(bot, {
    on: events.trap.bind(events),
    prependListener: undefined,
    removeListener: undefined,
    emit: (event: string, ...args: unknown[]) => {
      events.trip(event, ...args)
      return true
    }
  })
  const originalPick = bot.pickFriend
  const submitted = Promise.withResolvers<void>()
  bot.pickFriend = () => ({ share: async () => submitted.resolve() })
  const request = instance
    .signCard(
      {},
      {
        type: 'custom',
        title: '等待保存配置',
        url: 'https://example.com/song',
        audio: 'https://example.com/audio.mp3'
      },
      (message) => {
        throw new Error(message)
      }
    )
    .then(
      () => assert.fail('配置重载应取消当前等待请求'),
      (error: unknown) => error
    )
  await submitted.promise
  assert.equal(events.listeners('sync.message').length, 2)
  const saved = await guoba.configInfo.setConfigData(
    { path: '/triptrap/music', timeoutMs: 100 },
    context
  )
  assert.equal(saved.isOk, true, saved.message)
  assert.match(String(await request), /服务已关闭/)
  assert.deepEqual(events.listeners('sync.message'), [hostListener])
  assert.equal(events.listeners('message.private').length, 0)
  assert.equal(stack.length, 3)
  assert.equal(stack[1].path, '/triptrap/music')
  const yaml: Config = YAML.parse(await readFile(configPath, 'utf8'))
  assert.equal(yaml.path, '/triptrap/music')
  bot.pickFriend = originalPick
  await testApp.probe(command('#音之测测'))
  assert.equal(hostEvents, 1)
  assert.deepEqual(events.listeners('sync.message'), [hostListener])
  assert.equal(events.listeners('message.private').length, 0)
  bot.pickFriend = () => ({ share: async () => {} })
  const replies: FixtureReply[] = []
  await testApp.probe({
    isMaster: true,
    msg: '#音之测测',
    reply: async (message) => {
      replies.push(message)
      return true
    }
  })
  assert.match(String(replies.at(-1)), /生成\/回传.*超时/)
  assert.deepEqual(events.listeners('sync.message'), [hostListener])
  assert.equal(events.listeners('message.private').length, 0)
  assert.equal((await guoba.configInfo.setConfigData({ enabled: false }, context)).isOk, true)
  assert.equal(stack.length, 0)
})

test('锅巴根入口提供账号、好友与固定字段子表单，JSON 作为只读预览', async (t) => {
  const { guoba } = await guobaFixture(t)
  assert.equal(guoba.pluginInfo.name, 'music-card-sign')
  assert.equal(guoba.pluginInfo.isV3, true)
  const info = guoba.configInfo
  const fields = info.schemas.flatMap(({ field }) => (field ? [field] : [])).toSorted()
  assert.deepEqual(fields, [
    'apiKey',
    'botId',
    'commandBotBlacklist',
    'commandBotMode',
    'commandBotWhitelist',
    'defaultPlatform',
    'enabled',
    'localPort',
    'path',
    'platformEntries',
    'platforms',
    'targetFriend',
    'targetId',
    'testMusic',
    'testSong.audio',
    'testSong.id',
    'testSong.image',
    'testSong.mode',
    'testSong.platform',
    'testSong.singer',
    'testSong.title',
    'testSong.type',
    'testSong.url',
    'timeoutMs'
  ])
  const data = info.getConfigData()
  assert.equal(data.enabled, true)
  assert.equal(data.targetId, '')
  assert.deepEqual(data.targetFriend, [])
  assert.equal(data.defaultPlatform, 'default')
  assert.deepEqual(JSON.parse(data.platforms), {})
  assert.deepEqual(data.platformEntries, [])
  assert.equal(data.testSong.title, '晴天')
  assert.equal(data.testSong.mode, 'custom')
  assert.equal(JSON.parse(data.testMusic).title, '晴天')
  for (const field of ['testMusic', 'platforms']) {
    const schema = info.schemas.find((item) => item.field === field)
    assert.ok(schema)
    assert.partialDeepStrictEqual(schema.componentProps, { readonly: true })
  }
  for (const item of info.schemas.filter((schema) => schema.component === 'GSubForm'))
    assert.partialDeepStrictEqual(item.componentProps, { multiple: true })
  const sourceSchema = info.schemas.find(({ field }) => field === 'testSong.type')
  assert.equal(sourceSchema?.component, 'AutoComplete')
  assert.partialDeepStrictEqual(sourceSchema?.componentProps, {
    options: [
      { value: 'qq' },
      { value: '163' },
      { value: 'kugou' },
      { value: 'kuwo' },
      { value: 'migu' }
    ]
  })
  assert.equal(info.schemas.find(({ field }) => field === 'platformEntries')?.component, 'GSubForm')
  assert.equal(info.schemas.find(({ field }) => field === 'apiKey')?.component, 'InputPassword')
  const botSchema = info.schemas.find(({ field }) => field === 'botId')
  assert.equal(botSchema?.component, 'AutoComplete')
  assert.deepEqual(botSchema?.componentProps, {
    placeholder: '选择在线 icqq 账号或输入 QQ',
    options: [{ value: '123456789', label: '签名账号（123456789）' }]
  })
  const friendSchema = info.schemas.find(({ field }) => field === 'targetFriend')
  assert.equal(friendSchema?.component, 'GSelectFriend')
  assert.deepEqual(friendSchema?.componentProps, {
    isRadioSelection: true,
    maxSelectCount: 1,
    params: { bot_id: '123456789' }
  })
  const schema = info.schemas.find(({ field }) => field === 'defaultPlatform')
  assert.ok(schema)
  assert.equal(schema.component, 'AutoComplete')
  const { options } = schema.componentProps as {
    options: Array<{ label: string; value: string }>
  }
  assert.equal(options.length, 12)
  assert.match(options.find(({ value }) => value === 'default')!.label, /102021671/)
  assert.ok(!options.some(({ value }) => value === 'txqq'))
  assert.match(options.find(({ value }) => value === 'qq')!.label, /QQ 音乐/)
  assert.match(options.find(({ value }) => value === 'kugou_concept')!.label, /酷狗概念版/)
  for (const { value } of options) {
    const saved = await info.setConfigData({ defaultPlatform: value }, context)
    assert.equal(saved.isOk, true, saved.message)
    assert.equal(info.getConfigData().defaultPlatform, value)
    assert.doesNotThrow(() => selectPlatform({ _platform: value }, {}))
  }
})

test('锅巴子表单保存空选填项、重命名平台与歌曲模式，辅助字段不落盘', async (t) => {
  const { guoba, configPath } = await guobaFixture(t)
  const info = guoba.configInfo
  const initial = await info.setConfigData(
    {
      platforms: { original: { appid: 123, appname: 'com.example.app', extra: '保留' } },
      testMusic: {
        title: '原歌名',
        url: 'https://example.com/song',
        audio: 'https://example.com/song.mp3',
        extension: true
      }
    },
    context
  )
  assert.equal(initial.isOk, true, initial.message)
  const data = info.getConfigData()
  data.platformEntries[0].name = ' NEW '
  data.platformEntries[0].appname = ''
  Object.assign(data.testSong, { audio: '', platform: 'new' })
  const saved = await info.setConfigData(data, context)
  assert.equal(saved.isOk, true, saved.message)
  const yaml: Config = YAML.parse(await readFile(configPath, 'utf8'))
  assert.deepEqual(yaml.platforms, { new: { appid: 123, extra: '保留' } })
  assert.deepEqual(yaml.testMusic, {
    type: 'custom',
    title: '原歌名',
    url: 'https://example.com/song',
    _platform: 'new',
    extension: true
  })
  assert.equal(Object.hasOwn(yaml, 'platformEntries'), false)
  assert.equal(Object.hasOwn(yaml, 'testSong'), false)
  assert.deepEqual(JSON.parse(info.getConfigData().platforms), yaml.platforms)
  assert.deepEqual(JSON.parse(info.getConfigData().testMusic), yaml.testMusic)
  const switched = await info.setConfigData(
    {
      testSong: {
        ...info.getConfigData().testSong,
        mode: 'id',
        type: 'my_api',
        id: '00123',
        platform: ''
      }
    },
    context
  )
  assert.equal(switched.isOk, true, switched.message)
  assert.deepEqual(JSON.parse(info.getConfigData().testMusic), {
    type: 'my_api',
    id: '00123',
    extension: true
  })
  assert.equal(info.getConfigData().testSong.mode, 'id')
  // 普通锅巴直接提交点号字段，Next 的嵌套对象在上面验证。
  const dotted = Object.fromEntries(
    Object.entries({ ...info.getConfigData().testSong, type: '163', id: '00186016' }).map(
      ([key, value]) => [`testSong.${key}`, value]
    )
  )
  const dottedSaved = await info.setConfigData(dotted, context)
  assert.equal(dottedSaved.isOk, true, dottedSaved.message)
  assert.deepEqual(JSON.parse(info.getConfigData().testMusic), {
    type: '163',
    id: '00186016',
    extension: true
  })
  const persisted = YAML.parse(await readFile(configPath, 'utf8'))
  assert.ok(Object.keys(persisted).every((key) => !key.startsWith('testSong')))
})

test('锅巴子表单必填项不完整时拒绝保存，保留原配置', async (t) => {
  const { guoba, configPath } = await guobaFixture(t)
  const info = guoba.configInfo
  const original = await readFile(configPath, 'utf8')
  for (const data of [
    { platformEntries: [{ name: '', appid: 123 }] },
    { platformEntries: [{ name: 'app', appid: '' }] },
    {
      platformEntries: [
        { name: 'app', appid: 1 },
        { name: 'APP', appid: 2 }
      ]
    },
    { testSong: { mode: 'custom', title: '', url: 'https://example.com/song' } },
    { testSong: { mode: 'custom', title: '测试曲', url: 'wrong' } },
    { testSong: { mode: 'id', type: 'qq', id: '' } },
    { 'testSong.mode': 'id', 'testSong.type': 'qq', 'testSong.id': '' }
  ]) {
    const saved = await info.setConfigData(data, context)
    assert.equal(saved.isOk, false)
    assert.ok(saved.message)
    assert.equal(await readFile(configPath, 'utf8'), original)
  }
})

test('锅巴单选好友写入联系人，清空选择仍可手填 QQ，辅助字段不落盘', async (t) => {
  const { guoba, configPath } = await guobaFixture(t)
  const info = guoba.configInfo
  const selected = await info.setConfigData({ targetId: '', targetFriend: [234567890] }, context)
  assert.equal(selected.isOk, true)
  assert.equal(info.getConfigData().targetId, '234567890')
  const yaml: Config = YAML.parse(await readFile(configPath, 'utf8'))
  assert.equal(yaml.targetId, '234567890')
  assert.equal(Object.hasOwn(yaml, 'targetFriend'), false)
  assert.equal(
    (await info.setConfigData({ targetId: '789012345', targetFriend: [] }, context)).isOk,
    true
  )
  assert.equal(info.getConfigData().targetId, '789012345')
  for (const targetFriend of [[1, 2], [null], '234567890', ['wrong']]) {
    assert.equal((await info.setConfigData({ targetFriend }, context)).isOk, false)
    assert.equal(info.getConfigData().targetId, '789012345')
  }
  assert.equal((await info.setConfigData({ targetId: '', targetFriend: [] }, context)).isOk, true)
  assert.equal(info.getConfigData().targetId, '')
})

test('锅巴保存写入 YAML，并立即更新路由、鉴权、账号、联系人及自定义平台', async (t) => {
  const { guoba, configPath, stack, bot, cards, targets, testApp } = await guobaFixture(t)
  const testMusic = {
    type: 'custom',
    title: '锅巴测试',
    singer: '测试歌手',
    url: 'https://example.com/song',
    audio: 'https://example.com/audio.mp3'
  }
  const platforms = { 'custom-app': { appid: 200079 } }
  const saved = await guoba.configInfo.setConfigData(
    {
      botId: String(bot.uin),
      targetId: '987654321',
      defaultPlatform: 'custom-app',
      path: '/guoba/music',
      timeoutMs: 500,
      apiKey: 'guoba-offline-test-key',
      platforms: JSON.stringify(platforms),
      testMusic: JSON.stringify(testMusic)
    },
    context
  )
  assert.equal(saved.isOk, true)
  const yaml: Config = YAML.parse(await readFile(configPath, 'utf8'))
  assert.equal(yaml.botId, String(bot.uin))
  assert.equal(yaml.targetId, '987654321')
  assert.equal(yaml.defaultPlatform, 'custom-app')
  assert.equal(yaml.timeoutMs, 500)
  assert.deepEqual(yaml.platforms, platforms)
  assert.deepEqual(yaml.testMusic, testMusic)
  assert.equal(stack.length, 3)
  assert.equal(stack[1].path, '/guoba/music')
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
  await stack[1].handle({ url: '/', method: 'POST', headers: {}, body: testMusic }, response)
  assert.equal(response.statusCode, 401)
  await stack[1].handle(
    {
      url: '/',
      method: 'POST',
      headers: { 'x-api-key': 'guoba-offline-test-key' },
      body: testMusic
    },
    response
  )
  assert.equal(response.statusCode, 200)
  assert.equal(JSON.parse(response.body).meta.music.appid, 200079)
  await testApp.probe(command('#音之测测'))
  assert.equal(JSON.parse(cards.at(-1)!).meta.music.title, '锅巴测试')
  assert.equal(JSON.parse(cards.at(-1)!).meta.music.appid, 200079)
  assert.equal(bot.listenerCount('sync.message'), 0)
  assert.deepEqual(targets, [987654321, 987654321])
})

test('锅巴拒绝坏字段，校验失败保持原配置和已挂载路由', async (t) => {
  const { guoba, stack, configPath } = await guobaFixture(t)
  const original = await readFile(configPath, 'utf8')
  const handler = stack[1].handle
  for (const data of [
    { testMusic: '{' },
    { testMusic: '[]' },
    { testMusic: 'null' },
    { platforms: '[]' },
    { botId: '1.5' },
    { targetId: '0' },
    { targetId: '1.5' },
    { targetId: '9007199254740992' },
    { targetId: 987654321 },
    { path: '/bad/' },
    { timeoutMs: 0 },
    { localPort: 65536 },
    { enabled: 'true' },
    { commandBotMode: 'invalid' },
    { commandBotBlacklist: '123456789' },
    { commandBotWhitelist: [null] },
    { commandBotWhitelist: [''] },
    { commandBotWhitelist: [{}] },
    { defaultPlatform: '' },
    { defaultPlatform: 'unknown' },
    { defaultPlatform: 'txqq' },
    { defaultPlatform: 123 },
    { platforms: JSON.stringify({ bad: { appid: 1, appname: 'com.test.app', appsign: 'bad' } }) }
  ]) {
    const result = await guoba.configInfo.setConfigData(data, context)
    assert.equal(result.isOk, false)
    assert.ok(result.message)
    assert.equal(await readFile(configPath, 'utf8'), original)
    assert.equal(stack[1].handle, handler)
  }
})

test('锅巴设置被占用的端口时恢复旧配置和可用服务', async (t) => {
  const { guoba, stack, configPath, testApp } = await guobaFixture(t)
  const original = await readFile(configPath, 'utf8')
  const server = http.createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const result = await guoba.configInfo.setConfigData(
    { localPort: address.port, path: '/new/music' },
    context
  )
  assert.equal(result.isOk, false)
  assert.match(result.message, /EADDRINUSE/)
  assert.equal(await readFile(configPath, 'utf8'), original)
  assert.equal(stack.length, 3)
  assert.equal(stack[1].path, '/music_card/card')
  assert.equal(guoba.configInfo.getConfigData().localPort, 0)
  await testApp.probe(command('#音之测测'))
})

test('锅巴保存失败恢复内存配置与服务，开关多次保存不重复挂载', async (t) => {
  const { guoba, directory, configPath, stack } = await guobaFixture(t)
  const module = (await import(pathToFileURL(join(directory, 'lib/config/index.js')).href)) as {
    default: typeof ConfigModule
  }
  const previousSave = module.default.configSave
  const original = await readFile(configPath, 'utf8')
  module.default.configSave = async () => {
    throw new Error('ENOSPC')
  }
  const failed = await guoba.configInfo.setConfigData(
    { botId: '987654321', path: '/failed/music' },
    context
  )
  module.default.configSave = previousSave
  assert.equal(failed.isOk, false)
  assert.equal(await readFile(configPath, 'utf8'), original)
  assert.equal(guoba.configInfo.getConfigData().botId, '')
  assert.equal(stack.length, 3)
  assert.equal(stack[1].path, '/music_card/card')
  assert.equal((await guoba.configInfo.setConfigData({ enabled: false }, context)).isOk, true)
  assert.equal(stack.length, 0)
  assert.equal((await guoba.configInfo.setConfigData({ enabled: true }, context)).isOk, true)
  assert.equal((await guoba.configInfo.setConfigData({ enabled: true }, context)).isOk, true)
  assert.equal(stack.length, 3)
})
