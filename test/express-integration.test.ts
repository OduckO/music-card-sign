import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { EventEmitter } from 'node:events'
import express from 'express'
import { mountService } from '../src/models/http'
import { MusicSigner } from '../src/models/music-sign'
import type { HttpSigner, IcqqBot } from '../src/types'

test('实际云崽 Express：POST 经 body 解析与路径挂载后仍返回原文，卸载后 404', async (t) => {
  const app = Object.assign(express(), { quiet: [] as string[] })
  app.use(express.json())
  const raw =
    '{\n"view":"music","prompt":"[分享]测试","extra":"opaque-server-field","meta":{"music":{"appid":100497308,"title":"测试","desc":"歌手","jumpUrl":"https://example.com/song","musicUrl":"https://example.com/audio.mp3","preview":""}}\n}'
  const bot: IcqqBot & EventEmitter = Object.assign(new EventEmitter(), {
    uin: 123456789,
    isOnline: () => true,
    pickFriend: () => ({
      share: async () =>
        bot.emit('sync.message', {
          from_id: bot.uin,
          to_id: bot.uin,
          message: [{ type: 'json', data: raw }]
        })
    })
  })
  const signer = new MusicSigner({ getBots: () => [bot], timeoutMs: 100 })
  t.after(() => signer.close())
  const unmount = await mountService(app, signer)
  t.after(unmount)
  const server = http.createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections()
        server.close((error) => (error ? reject(error) : resolve()))
      })
  )
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const url = `http://127.0.0.1:${address.port}/music_card/card`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'custom',
      title: '测试',
      singer: '歌手',
      url: 'https://example.com/song',
      audio: 'https://example.com/audio.mp3'
    })
  })
  assert.equal(response.status, 200)
  assert.equal(await response.text(), raw)
  await unmount()
  assert.equal((await fetch(url)).status, 404)
})

test('云崽追加兜底重定向后，重新开启的路由仍可用且保留前置鉴权', async (t) => {
  const app = Object.assign(express(), { quiet: [] as string[] })
  app.use(function hostAuth(req, res, next) {
    if (req.headers['x-host-key'] !== 'offline') return res.sendStatus(401)
    next()
  })
  app.use(express.json())
  const signer: HttpSigner = { sign: async () => ({ view: 'music', meta: { music: {} } }) }
  let unmount = await mountService(app, signer)
  // 与本机 Yunzai.run() 的末尾中间件一致。
  app.use((_req, res) => res.redirect('/fallback'))
  await unmount()
  unmount = await mountService(app, signer)
  t.after(unmount)
  const server = http.createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections()
        server.close((error) => (error ? reject(error) : resolve()))
      })
  )
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const url = `http://127.0.0.1:${address.port}/music_card/card`
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/json', 'x-host-key': 'offline' },
    body: '{}'
  })
  assert.equal(response.status, 200)
  const denied = await fetch(url, { method: 'POST', body: '{}' })
  assert.equal(denied.status, 401)
  assert.match(denied.headers.get('content-type') ?? '', /application\/json/)
  assert.match(await denied.text(), /宿主鉴权/)
  const other = await fetch(`http://127.0.0.1:${address.port}/other`)
  assert.equal(other.status, 401)
  assert.equal(await other.text(), 'Unauthorized')
})

test('音卡路径的宿主鉴权重定向和前置 JSON 解析错误均返回 JSON，其他路径保持宿主行为', async (t) => {
  const app = Object.assign(express(), { quiet: [] as string[] })
  app.use((req, res, next) => {
    if (req.headers['x-host-key'] !== 'offline') return res.redirect('/login')
    next()
  })
  app.use(express.json())
  let signed = 0
  const signer: HttpSigner = {
    sign: async () => {
      signed++
      return { view: 'music', meta: { music: {} } }
    }
  }
  const logs: string[] = []
  let unmount = await mountService(app, signer, { onLog: (_level, message) => logs.push(message) })
  app.use((_req, res) => res.redirect('/fallback'))
  await unmount()
  unmount = await mountService(app, signer, { onLog: (_level, message) => logs.push(message) })
  t.after(unmount)
  const server = http.createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      })
  )
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const base = `http://127.0.0.1:${address.port}`
  const denied = await fetch(`${base}/music_card/card`, { redirect: 'manual' })
  assert.equal(denied.status, 401)
  assert.match(denied.headers.get('content-type') ?? '', /application\/json/)
  assert.match(await denied.text(), /宿主鉴权/)
  const invalid = await fetch(`${base}/music_card/card`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-host-key': 'offline' },
    body: '{'
  })
  assert.equal(invalid.status, 400)
  assert.match(invalid.headers.get('content-type') ?? '', /application\/json/)
  assert.match(await invalid.text(), /error/)
  assert.equal(signed, 0)
  assert.ok(logs.some((message) => message.includes('宿主入口')))
  assert.ok(logs.some((message) => message.includes('宿主鉴权')))
  const unknown = await fetch(`${base}/other`, { redirect: 'manual' })
  assert.equal(unknown.status, 302)
  await unmount()
  const removed = await fetch(`${base}/music_card/card`, { redirect: 'manual' })
  assert.equal(removed.status, 302)
})

test('JiuLi 未就绪的文本 503 转为 JSON，保留启动阶段和其他路径响应', async (t) => {
  const app = Object.assign(express(), { quiet: [] as string[] })
  app.use(function hostReadiness(_req, res) {
    res
      .status(503)
      .type('text/plain')
      .send('Service Unavailable\n机器人尚未就绪（当前阶段：加载插件）')
  })
  const signer: HttpSigner = {
    sign: async () => {
      assert.fail('未就绪时不能跳过宿主开始签名')
    }
  }
  const unmount = await mountService(app, signer)
  t.after(unmount)
  const server = http.createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      })
  )
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const base = `http://127.0.0.1:${address.port}`
  const response = await fetch(`${base}/music_card/card`)
  assert.equal(response.status, 503)
  assert.match(response.headers.get('content-type') ?? '', /application\/json/)
  assert.match((await response.json()).error, /当前阶段：加载插件/)
  const other = await fetch(`${base}/other`)
  assert.equal(other.status, 503)
  assert.match(other.headers.get('content-type') ?? '', /text\/plain/)
})
