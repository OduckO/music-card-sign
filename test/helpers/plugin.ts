import type { TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, cp, rm, readFile, writeFile, mkdir, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve as resolvePath, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { PluginOptions, PluginRule } from 'trss-yunzai'
import type { MusicCardSign } from '../../src/apps/music-card-sign'
import type { Config, IcqqBot, ShareContent, AppPlatform, HttpRequest } from '../../src/types'
import YAML from 'yaml'

const projectRoot = process.cwd()

export type FixtureReply = string | { type: 'json'; data: string }
export type FixtureReplyResult = boolean | void | { message_id?: number[]; error?: string[] }

export interface FixtureCommandEvent<Message = FixtureReply> {
  self_id?: string | number
  msg: string
  reply: (message: Message) => Promise<FixtureReplyResult>
}

export interface FixtureCleanup {
  dispose: () => Promise<void>
  restore: () => Promise<void>
}

export interface FixturePlugin extends Pick<MusicCardSign, 'init' | 'signCard'> {
  rule: Array<PluginRule & { reg: string | RegExp }>
  cleanup: FixtureCleanup[]
  forwardCard: (event: FixtureCommandEvent) => Promise<boolean>
  probe: (event: FixtureCommandEvent) => Promise<boolean>
  toggle: (event: FixtureCommandEvent<string>) => Promise<boolean>
  setBot: (event: FixtureCommandEvent<string>) => Promise<boolean>
  status: (event: Pick<FixtureCommandEvent<string>, 'reply'>) => Promise<boolean>
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
  bot: IcqqBot
  stack: FixtureRouterLayer[]
  cards: string[]
  directory: string
  hostRoot: string
}

export const command = (msg: string): FixtureCommandEvent => ({
  msg,
  reply: async () => ({ message_id: [1] })
})

export async function fixture(
  t: TestContext,
  settings: Partial<Config> = {},
  persisted: { legacy?: Partial<Config>; yaml?: Partial<Config> } = {}
): Promise<PluginFixture> {
  const hostRoot = await mkdtemp(join(tmpdir(), 'music-card-plugin-'))
  const directory = join(hostRoot, 'plugins/music-card-sign')
  const previousCwd = process.cwd()
  await mkdir(directory, { recursive: true })
  await mkdir(join(hostRoot, 'lib/plugins'), { recursive: true })
  await mkdir(join(hostRoot, 'config'), { recursive: true })
  await symlink(join(projectRoot, 'node_modules'), join(hostRoot, 'node_modules'), 'junction')
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
  for (const file of ['index.js', 'guoba.support.js', 'package.json', 'lib', 'resources'])
    await cp(join(projectRoot, file), join(directory, file), { recursive: true })
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
    logger: globalThis.logger
  }
  t.after(() => Object.assign(globalThis, old))
  Object.assign(globalThis, {
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
  const cards: string[] = []
  const bot: IcqqBot = Object.assign(new EventEmitter(), {
    uin: 123456789,
    isOnline: () => true,
    pickFriend: (id: number) => ({
      share: async (content: ShareContent, platform: AppPlatform) => {
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
  })
  const stack: FixtureRouterLayer[] = []
  Object.assign(globalThis, {
    Bot: {
      uin: [bot.uin],
      [bot.uin]: { adapter: { name: 'ICQQ' }, sdk: bot },
      express: {
        router: { stack },
        quiet: [],
        use(path: string, handle: FixtureRouterLayer['handle']) {
          stack.push({ path, handle })
        }
      }
    },
    logger: { mark() {}, info() {}, error() {}, warn() {} }
  })
  const { apps } = (await import(pathToFileURL(join(directory, 'index.js')).href)) as {
    apps: { MusicCardSign: new () => FixturePlugin }
  }
  const instance = new apps.MusicCardSign()
  await instance.init()
  t.after(async () => {
    for (const cleanup of instance.cleanup) await cleanup.dispose()
  })
  return { instance, bot, stack, cards, directory, hostRoot }
}
