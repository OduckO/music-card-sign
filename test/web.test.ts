import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import express from 'express'
import type { PageContext } from '../src/modules/web'
import type { PanelState, SignResult } from '../web/types'
import { fixture } from './helpers/plugin'

for (const host of ['qqbot-web', 'guoba'] as const) {
  test(`${host} 面板注册、保存与签名使用共享服务，错误返回 JSON`, async (t) => {
    const { directory, cards, bot } = await fixture(t, { apiKey: 'test-key' })
    const { init } = (await import(pathToFileURL(join(directory, 'webadapter/index.js')).href)) as {
      init: (ctx: PageContext) => void
    }
    const app = express()
    const pages: Parameters<PageContext['registerPage']>[0][] = []
    const routes: string[] = []
    const base = host === 'qqbot-web' ? '/qqbot-web/api' : '/guoba/api/custom/music-card-sign'
    const prefix = host === 'qqbot-web' ? '/music-card-sign' : ''
    init({
      ...(host === 'qqbot-web' ? { basePath: 'qqbot-web' } : {}),
      registerPage: (page) => pages.push(page),
      registerApi: (method, route, handler) => {
        routes.push(`${method} ${route}`)
        app[method](`${base}${route}`, handler)
      }
    })
    assert.deepEqual(routes, [
      `get ${prefix}/config`,
      `post ${prefix}/config`,
      `post ${prefix}/sign`
    ])
    assert.deepEqual(
      pages.map(({ src }) => src),
      ['settings.html', 'sign.html']
    )
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
    const invalid = await post('/config', { botId: 'wrong', path: '/changed' })
    assert.equal(invalid.status, 400)
    assert.equal((await invalid.json()).ok, false)
    assert.notEqual((await settings()).config.path, '/changed')
    const saved = await post('/config', { defaultPlatform: 'kugou_concept' })
    assert.equal(saved.status, 200)
    assert.equal((await settings()).config.defaultPlatform, 'kugou_concept')
    assert.equal((await settings()).hasApiKey, true, '未提交 API Key 时保留原值')
    const cleared = await post('/config', { apiKey: '' })
    assert.equal(cleared.status, 200)
    assert.equal((await settings()).hasApiKey, false)

    const request = { type: 'custom', title: '测试曲', url: 'https://example.com/song' }
    const signed = await post('/sign', { request })
    assert.equal(signed.status, 200)
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
    const disabled = await post('/sign', { request })
    assert.equal(disabled.status, 503)
    assert.match((await disabled.json()).error, /未开启/)
  })
}
