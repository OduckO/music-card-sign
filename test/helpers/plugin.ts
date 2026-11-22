import type { TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, cp, rm, readFile, writeFile, mkdir, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve as resolvePath, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { PluginOptions, PluginRule } from 'trss-yunzai'
import type { MusicCardSign } from '../../src/apps/music-card-sign'
import type {
  Config,
  IcqqBot,
  ShareContent,
  AppPlatform,
  HttpRequest,
  MusicEvent,
  ResolverContext
} from '../../src/types'
import YAML from 'yaml'

const projectRoot = process.cwd()

export type FixtureReply =
  | string
  | { type: 'image'; file: string }
  | { type: 'json'; data: string }
  | { type: 'raw'; data: { type: 'json'; data: { data: string } } }
export type FixtureReplyResult =
  | boolean
  | void
  | { message_id?: number[]; error?: string | string[] }

export interface FixtureCommandEvent<Message = FixtureReply> {
  isMaster?: boolean
  self_id?: string | number
  group_id?: string | number
  user_id?: string | number
  bot?: { adapter?: { name: string } }
  msg: string
  reply: (message: Message) => Promise<FixtureReplyResult>
}

export interface FixtureCleanup {
  dispose: () => Promise<void>
  restore: () => Promise<void>
}

export interface FixtureApp {
  priority: number
  namespace: string
  rule: Array<PluginRule & { reg: string | RegExp }>
  cleanup: FixtureCleanup[]
  handler?: Array<{ key: string; fn: string }>
}

export interface FixturePlugin extends FixtureApp, Pick<MusicCardSign, 'init' | 'signCard'> {
  onUnload: () => Promise<void>
  accept: (event: MusicEvent) => false | Promise<'return' | false>
}

export interface FixtureTestApp extends FixtureApp {
  forwardCard: (event: FixtureCommandEvent) => Promise<boolean>
  probe: (event: FixtureCommandEvent) => Promise<boolean>
}

export interface FixtureManageApp extends FixtureApp {
  help: (event: FixtureCommandEvent) => Promise<boolean>
  toggle: (event: FixtureCommandEvent<string>) => Promise<boolean>
  setBot: (event: FixtureCommandEvent<string>) => Promise<boolean>
  setTarget: (event: FixtureCommandEvent<string>) => Promise<boolean>
  setPlatform: (event: FixtureCommandEvent<string>) => Promise<boolean>
  setTimeout: (event: FixtureCommandEvent<string>) => Promise<boolean>
  update: (event: FixtureCommandEvent) => Promise<boolean>
  status: (
    event: Pick<FixtureCommandEvent<string>, 'reply'> & Partial<FixtureCommandEvent<string>>
  ) => Promise<boolean>
}

export interface FixtureResponse {
  statusCode: number
  body: string
  writeHead: (code: number) => void
  end: (body: string) => void
}

export interface FixtureRouterLayer {
  path: string
  handle: (
    request: Pick<HttpRequest, 'url' | 'method' | 'headers' | 'body'>,
    response: FixtureResponse
  ) => Promise<void>
}

export interface PluginFixture {
  instance: FixturePlugin
  testApp: FixtureTestApp
  manageApp: FixtureManageApp
  bot: IcqqBot & EventEmitter
  host: EventEmitter & { em: (name: string, event: MusicEvent) => MusicEvent }
  stack: FixtureRouterLayer[]
  cards: string[]
  targets: number[]
  logs: Array<{ level: string; message: string }>
  directory: string
  hostRoot: string
  handlers: FixtureHandlers
  screenshots: Array<{ name: string; data: { tplFile: string; html: string; imgType: string } }>
}

export interface FixtureHandlers {
  add: (entry: {
    key: string
    ns: string
    priority?: number
    fn: (context: ResolverContext, data: { type: string; id: string }) => unknown
  }) => void
  del: (namespace: string, key?: string) => void
}

export const command = (msg: string): FixtureCommandEvent => ({
  isMaster: true,
  msg,
  reply: async () => ({ message_id: [1] })
})

export async function fixture(
  t: TestContext,
  settings: Partial<Config> = {},
  persisted: {
    legacy?: Partial<Config>
    yaml?: Partial<Config>
    guobaFirst?: boolean
    noAddCleanup?: boolean
    deferInit?: boolean
    noScreenshots?: boolean
    appFiles?: Record<string, string>
  } = {}
): Promise<PluginFixture> {
  const hostRoot = await mkdtemp(join(tmpdir(), 'music-card-plugin-'))
  const directory = join(hostRoot, 'plugins/music-card-sign')
  const previousCwd = process.cwd()
  await mkdir(directory, { recursive: true })
  await mkdir(join(hostRoot, 'lib/plugins'), { recursive: true })
  await mkdir(join(hostRoot, 'lib/puppeteer'), { recursive: true })
  await writeFile(
    join(hostRoot, 'lib/puppeteer/puppeteer.js'),
    `import { mkdir, writeFile } from 'node:fs/promises'
export const screenshots = []
export default {
  async screenshot(name, data) {
    screenshots.push({ name, data })
    await mkdir('temp/html/' + name, { recursive: true })
    await writeFile('temp/html/' + name + '/' + (data.saveId || 'render') + '.html', data.html)
    return ${persisted.noScreenshots ? 'false' : "{ type: 'image', file: 'base64://help-preview' }"}
  }
}
`
  )
  await mkdir(join(hostRoot, 'config'), { recursive: true })
  await symlink(join(projectRoot, 'node_modules'), join(hostRoot, 'node_modules'), 'junction')
  await writeFile(join(hostRoot, 'package.json'), '{"type":"module"}')
  await writeFile(
    join(hostRoot, 'lib/plugins/handler.js'),
    `const events = new Map()
const Handler = {
  add(entry) {
    Handler.del(entry.ns, entry.key)
    const handlers = events.get(entry.key) || []
    handlers.push({ priority: 500, ...entry })
    events.set(entry.key, handlers.sort((a, b) => a.priority - b.priority))
  },
  del(ns, key) {
    for (const name of key ? [key] : events.keys()) {
      const remaining = (events.get(name) || []).filter(entry => entry.ns !== ns)
      if (remaining.length) events.set(name, remaining)
      else events.delete(name)
    }
  },
  has(key) { return events.has(key) },
  async call(key, context, data) {
    let result
    for (const entry of events.get(key) || []) {
      let done = true
      result = await entry.fn.call(entry.self, context, data, () => { done = false })
      if (done) return result
    }
    return result
  }
}
export default Handler
`
  )
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
  for (const file of [
    'index.js',
    'guoba.support.js',
    'webadapter',
    'package.json',
    'lib',
    'resources'
  ])
    await cp(join(projectRoot, file), join(directory, file), { recursive: true })
  await Promise.all(
    Object.entries(persisted.appFiles ?? {}).map(async ([filename, source]) => {
      const target = join(directory, 'lib/apps', filename)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, source)
    })
  )
  const defaultsPath = join(directory, 'resources/config/config.yaml')
  const defaults: Config = YAML.parse(await readFile(defaultsPath, 'utf8'))
  await writeFile(defaultsPath, YAML.stringify({ ...defaults, ...settings }))
  if (persisted.legacy) {
    await mkdir(join(directory, 'config/config'), { recursive: true })
    await writeFile(join(directory, 'config/config/config.json'), JSON.stringify(persisted.legacy))
  }
  if (persisted.yaml)
    await writeFile(join(hostRoot, 'config/music-card-sign.yaml'), YAML.stringify(persisted.yaml))
  const old = {
    plugin: (globalThis as { plugin?: typeof plugin }).plugin,
    Bot: globalThis.Bot,
    logger: globalThis.logger,
    segment: globalThis.segment,
    fetch: globalThis.fetch
  }
  const loaded: { instance?: FixturePlugin; stopService?: () => Promise<void> } = {}
  t.after(async () => {
    try {
      for (const cleanup of loaded.instance?.cleanup ?? []) await cleanup.dispose()
      await loaded.stopService?.()
    } finally {
      Object.assign(globalThis, old)
      process.chdir(previousCwd)
      assert.ok(resolvePath(hostRoot).startsWith(resolvePath(tmpdir()) + sep))
      await rm(hostRoot, { recursive: true, force: true })
    }
  })
  const fetchStub: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    switch (url.origin + url.pathname) {
      case 'https://music.163.com/api/search/get':
        return Response.json({ code: 200, result: { songs: [] } })
      case 'https://mobileservice.kugou.com/api/v3/search/song':
        return Response.json({ status: 1, errcode: 0, data: { info: [] } })
      case 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp':
        return Response.json({ code: 0, data: { song: { list: [] } } })
      default:
        return old.fetch(input, init)
    }
  }
  Object.assign(globalThis, {
    fetch: fetchStub,
    plugin: class {
      cleanup: FixtureCleanup[] = []

      constructor(options: PluginOptions<'message'>) {
        Object.assign(this, options)
      }
      addCleanup(dispose: FixtureCleanup['dispose'], restore: FixtureCleanup['restore']) {
        this.cleanup.push({ dispose, restore })
      }
    }
  })
  const { default: handlers } = (await import(
    pathToFileURL(join(hostRoot, 'lib/plugins/handler.js')).href
  )) as { default: FixtureHandlers }
  const { screenshots } = (await import(
    pathToFileURL(join(hostRoot, 'lib/puppeteer/puppeteer.js')).href
  )) as { screenshots: PluginFixture['screenshots'] }
  if (persisted.noAddCleanup) Reflect.deleteProperty(plugin.prototype, 'addCleanup')
  const cards: string[] = []
  const targets: number[] = []
  const bot: IcqqBot & EventEmitter = Object.assign(new EventEmitter(), {
    uin: 123456789,
    nickname: '签名账号',
    fl: new Map([[234567890, { nickname: '好友昵称', remark: '收卡联系人' }]]),
    isOnline: () => true,
    pickFriend: (id: number) => ({
      share: async (content: ShareContent, platform: AppPlatform) => {
        targets.push(id)
        const view = content.audio ? 'music' : 'news'
        const raw = JSON.stringify(
          {
            app: view === 'music' ? 'com.tencent.music.lua' : 'com.tencent.tuwen.lua',
            view,
            prompt: content.content,
            extra: 'original-extra',
            meta: {
              [view]: {
                appid: platform.appid,
                title: content.title,
                desc: content.summary,
                jumpUrl: content.url,
                ...(content.audio ? { musicUrl: content.audio } : {}),
                preview: content.image
              }
            }
          },
          null,
          2
        )
        cards.push(raw)
        bot.emit('sync.message', {
          message_id: `signed:${cards.length}`,
          from_id: bot.uin,
          to_id: id,
          message: [{ type: 'json', data: raw }]
        })
      }
    })
  })
  const stack: FixtureRouterLayer[] = []
  const logs: PluginFixture['logs'] = []
  const segmentStub: Pick<typeof segment, 'raw'> = { raw: (data) => ({ type: 'raw', data }) }
  const host = Object.assign(new EventEmitter(), {
    em(this: EventEmitter, name: string, event: MusicEvent) {
      while (true) {
        this.emit(name, event)
        const dot = name.lastIndexOf('.')
        if (dot < 0) break
        name = name.slice(0, dot)
      }
      return event
    },
    uin: [bot.uin],
    [bot.uin]: { adapter: { name: 'ICQQ' }, sdk: bot },
    express: {
      router: { stack },
      quiet: [],
      use(path: string, handle: FixtureRouterLayer['handle']) {
        stack.push({ path, handle })
      }
    }
  })
  bot.on('message', (event: MusicEvent) => {
    event.self_id = bot.uin
    host.em(`message.${event.message_type || 'private'}.friend`, event)
  })
  bot.on('sync', (event: MusicEvent) => {
    event.self_id = bot.uin
    host.em('sync.message', event)
  })
  Object.assign(globalThis, {
    segment: segmentStub,
    Bot: host,
    logger: Object.fromEntries(
      ['mark', 'info', 'error', 'warn'].map((level) => [
        level,
        (message: string) => logs.push({ level, message })
      ])
    )
  })
  if (persisted.guobaFirst) {
    const pluginClass = (globalThis as { plugin?: typeof plugin }).plugin
    Object.assign(globalThis, { plugin: undefined })
    try {
      const guoba = await import(pathToFileURL(join(directory, 'guoba.support.js')).href)
      assert.equal(guoba.supportGuoba().pluginInfo.name, 'music-card-sign')
      assert.equal(stack.length, 0, '锅巴读取配置不应启动服务')
    } finally {
      Object.assign(globalThis, { plugin: pluginClass })
    }
  }
  const { apps } = (await import(pathToFileURL(join(directory, 'index.js')).href)) as {
    apps: {
      MusicCardSign: new () => FixturePlugin
      MusicCardTest: new () => FixtureTestApp
      MusicCardManage: new () => FixtureManageApp
    }
  }
  const instance = new apps.MusicCardSign()
  const testApp = new apps.MusicCardTest()
  const manageApp = new apps.MusicCardManage()
  loaded.instance = instance
  if (!persisted.deferInit) {
    loaded.stopService = (
      await import(pathToFileURL(join(directory, 'lib/modules/music-card-sign/service.js')).href)
    ).stopService
    await instance.init()
  }
  return {
    instance,
    testApp,
    manageApp,
    bot,
    host,
    stack,
    cards,
    targets,
    logs,
    directory,
    hostRoot,
    handlers,
    screenshots
  }
}
