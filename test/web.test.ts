import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import express from 'express'
import type { PageContext } from '../src/modules/web'
import type { PanelState, SignResult } from '../webadapter/src/types'
import { fixture } from './helpers/plugin'

for (const host of ['qqbot-web', 'guoba'] as const) {
  test(`${host} 面板注册、保存与签名使用共享服务，错误返回 JSON`, async (t) => {
    const { directory, cards, bot } = await fixture(t, { apiKey: 'test-key' })
    const secondId = 345678901
    const secondBot = {
      ...bot,
      uin: secondId,
      nickname: '另一个签名账号',
      fl: new Map([[456789012, { nickname: '另一位好友' }]]),
      on: bot.on.bind(bot)
    }
    Object.assign(Bot, {
      uin: [bot.uin, secondId, 567890123, 678901234],
      [secondId]: { adapter: { name: 'ICQQ' }, sdk: secondBot },
      [567890123]: { adapter: { name: 'ICQQ' }, sdk: { ...secondBot, isOnline: () => false } },
      [678901234]: { adapter: { name: 'OneBotv11' }, sdk: secondBot }
    })
    const { init } = (await import(pathToFileURL(join(directory, 'webadapter/index.js')).href)) as {
      init: (ctx: PageContext) => void
    }
    const app = express()
    const pages: Parameters<PageContext['registerPage']>[0][] = []
    const routes: string[] = []
    const base = host === 'qqbot-web' ? '/qqbot-web/api' : '/guoba/api/custom/music-card-sign'
    const prefix = host === 'qqbot-web' ? '/music-card-sign' : ''
    init({
      apiBase: base,
      basePath: host === 'qqbot-web' ? 'qqbot-web' : '/guoba',
      registerPage: (page) => pages.push(page),
      registerApi: (method, route, handler) => {
        routes.push(`${method} ${route}`)
        app[method](`${base}${route}`, handler)
      }
    })
    assert.deepEqual(routes, [
      `get ${prefix}/config`,
      `post ${prefix}/friends`,
      `post ${prefix}/config`,
      `post ${prefix}/sign`,
      `get ${prefix}/fonts/Regular`,
      `get ${prefix}/fonts/Bold`
    ])
    assert.deepEqual(
      pages.map(({ src }) => src),
      ['panel.html']
    )
    assert.equal(pages[0].id, 'music-card-sign')
    for (const page of pages) {
      assert.equal(page.style, 'app.css')
      assert.equal(page.script, 'app.js')
      const html = await readFile(join(directory, 'webadapter', page.src), 'utf8')
      assert.match(html, /src="\.\/app\.js"/)
      assert.match(html, /href="\.\/app\.css"/)
    }
    const server = app.listen(0, '127.0.0.1')
    await new Promise<void>((resolve) => server.once('listening', resolve))
    t.after(() => {
      server.closeAllConnections()
      server.close()
    })
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    const url = `http://127.0.0.1:${address.port}${base}${prefix}`
    for (const weight of ['Regular', 'Bold']) {
      const response = await fetch(`${url}/fonts/${weight}`)
      assert.equal(response.status, 200)
      assert.match(response.headers.get('content-type') ?? '', /font\/woff2/)
      assert.match(response.headers.get('cache-control') ?? '', /max-age=604800/)
      assert.equal(
        Buffer.from(await response.arrayBuffer())
          .subarray(0, 4)
          .toString(),
        'wOF2'
      )
    }
    assert.equal((await fetch(`${url}/fonts/unknown`)).status, 404)
    const post = (path: string, body: unknown) =>
      fetch(`${url}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
    const settings = async () => {
      const response = await fetch(`${url}/config`)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      const data = (await response.json()) as { result: PanelState }
      return data.result
    }
    assert.equal((await settings()).hasApiKey, true)
    assert.equal(Object.hasOwn((await settings()).config, 'apiKey'), false)
    assert.ok((await settings()).platforms.includes('kugou_concept'))
    assert.deepEqual((await settings()).accounts, [
      { id: String(bot.uin), name: '签名账号' },
      { id: String(secondId), name: '另一个签名账号' }
    ])
    assert.deepEqual((await settings()).commandBots, [
      { id: String(bot.uin), name: '签名账号 · ICQQ' },
      { id: String(secondId), name: '另一个签名账号 · ICQQ' },
      { id: '678901234', name: '另一个签名账号 · OneBotv11' }
    ])
    const friends = async (botId: string) => {
      const response = await post('/friends', { botId })
      assert.equal(response.status, 200)
      return (await response.json()).result
    }
    assert.deepEqual(await friends(String(bot.uin)), {
      botId: String(bot.uin),
      friends: [{ id: '234567890', name: '收卡联系人' }]
    })
    assert.deepEqual(await friends(String(secondId)), {
      botId: String(secondId),
      friends: [{ id: '456789012', name: '另一位好友' }]
    })
    assert.deepEqual(await friends(''), { botId: '', friends: [] }, '多账号时不猜测签名 Bot')
    assert.equal((await post('/friends', { botId: 'wrong' })).status, 400)
    assert.equal((await post('/friends', { botId: '567890123' })).status, 503)
    const invalid = await post('/config', { botId: 'wrong', path: '/changed' })
    assert.equal(invalid.status, 400)
    assert.equal((await invalid.json()).ok, false)
    assert.notEqual((await settings()).config.path, '/changed')
    const saved = await post('/config', {
      defaultPlatform: 'kugou_concept',
      botId: String(bot.uin),
      commandBotMode: 'blacklist',
      commandBotBlacklist: [String(bot.uin)]
    })
    assert.equal(saved.status, 200)
    assert.equal((await settings()).config.defaultPlatform, 'kugou_concept')
    assert.equal((await settings()).hasApiKey, true, '未提交 API Key 时保留原值')
    assert.equal((await settings()).config.commandBotMode, 'blacklist')
    assert.deepEqual((await settings()).config.commandBotBlacklist, [String(bot.uin)])
    assert.equal(
      (await post('/config', { commandBotMode: 'whitelist', commandBotWhitelist: [] })).status,
      200
    )
    assert.deepEqual((await settings()).config.commandBotWhitelist, [])
    assert.deepEqual((await settings()).config.commandBotBlacklist, [String(bot.uin)])
    const cleared = await post('/config', { apiKey: '' })
    assert.equal(cleared.status, 200)
    assert.equal((await settings()).hasApiKey, false)

    const request = { type: 'custom', title: '测试曲', url: 'https://example.com/song' }
    const signed = await post('/sign', { request })
    assert.equal(signed.status, 200, '空白名单静默聊天指令，WebUI 签名仍可使用该 Bot')
    const result = ((await signed.json()) as { result: SignResult }).result
    assert.equal(result.raw, cards[0], '回传保留签名 JSON 原文')
    assert.equal(result.card.meta.music.appid, 101706348)
    assert.equal((await post('/sign', { request })).status, 200)
    assert.equal(cards.length, 1, '相同请求复用缓存')
    assert.equal((await post('/sign', { request, forceFresh: true })).status, 200)
    assert.equal(cards.length, 2)
    assert.equal((await settings()).status.pending, 0)
    assert.equal(bot.listenerCount('sync.message'), 0)

    assert.equal((await post('/sign', { request, forceFresh: 'yes' })).status, 400)
    assert.equal((await post('/sign', { request: [] })).status, 400)
    const oversized = await post('/sign', { request: { ...request, title: 'x'.repeat(70000) } })
    assert.equal(oversized.status, 413)
    assert.equal((await oversized.json()).ok, false)
    bot.pickFriend = () => ({
      share: async () => {
        throw new Error('模拟提交失败')
      }
    })
    const failed = await post('/sign', { request, forceFresh: true })
    assert.equal(failed.status, 503)
    const failure = await failed.json()
    assert.equal(failure.ok, false)
    assert.equal(failure.status, 502)
    assert.match(failure.error, /模拟提交失败/)
    assert.equal((await settings()).status.pending, 0)
    assert.equal((await post('/config', { enabled: false })).status, 200)
    assert.equal((await settings()).accounts.length, 2, '服务关闭后仍可选择在线 icqq 账号')
    assert.equal((await friends(String(bot.uin))).friends.length, 1)
    assert.equal((await post('/config', { targetId: '789012345' })).status, 200)
    assert.equal((await settings()).config.targetId, '789012345', '保留手填 QQ')
    const disabled = await post('/sign', { request })
    assert.equal(disabled.status, 503)
    assert.match((await disabled.json()).error, /未开启/)
  })
}
