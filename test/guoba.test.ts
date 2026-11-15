import { test } from 'node:test'
import type { TestContext } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import YAML from 'yaml'
import type { Result } from 'trss-yunzai/guoba'
import type { supportGuoba } from '../src/modules/guoba'
import type ConfigModule from '../src/config'
import type { Config } from '../src/types'
import { fixture, command } from './helpers/plugin'
import type { FixtureResponse } from './helpers/plugin'

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

test('锅巴根入口导出九项配置，JSON 编辑字段保持完整内容', async (t) => {
  const { guoba } = await guobaFixture(t)
  assert.equal(guoba.pluginInfo.name, 'music-card-sign')
  assert.equal(guoba.pluginInfo.isV3, true)
  const info = guoba.configInfo
  const fields = info.schemas.flatMap(({ field }) => (field ? [field] : [])).toSorted()
  assert.deepEqual(fields, [
    'apiKey',
    'botId',
    'enabled',
    'localPort',
    'path',
    'platforms',
    'targetId',
    'testMusic',
    'timeoutMs'
  ])
  const data = info.getConfigData()
  assert.equal(data.enabled, true)
  assert.equal(data.targetId, '')
  assert.deepEqual(JSON.parse(data.platforms), {})
  assert.equal(JSON.parse(data.testMusic).title, '晴天')
  assert.equal(info.schemas.find(({ field }) => field === 'apiKey')?.component, 'InputPassword')
})

test('锅巴保存写入 YAML，并立即更新路由、鉴权、账号、联系人及自定义平台', async (t) => {
  const { guoba, configPath, stack, bot, instance, cards, targets } = await guobaFixture(t)
  const testMusic = {
    type: 'custom',
    title: '锅巴测试',
    singer: '测试歌手',
    url: 'https://example.com/song',
    audio: 'https://example.com/audio.mp3',
    _platform: 'custom-app'
  }
  const platforms = { 'custom-app': { appid: 200079, appname: 'com.sing.client', app_sign: '' } }
  const saved = await guoba.configInfo.setConfigData(
    {
      botId: String(bot.uin),
      targetId: '987654321',
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
  await instance.probe(command('#音之测测'))
  assert.equal(JSON.parse(cards.at(-1)!).meta.music.title, '锅巴测试')
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
  const { guoba, stack, configPath, instance } = await guobaFixture(t)
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
  await instance.probe(command('#音之测测'))
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
