import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { EventEmitter } from 'node:events'
import express from 'express'
import { mountService } from '../lib/models/http.js'
import { MusicSigner } from '../lib/models/music-sign.js'

test('实际云崽 Express：POST 经 body 解析与路径挂载后仍返回原文，卸载后 404', async (t) => {
  const app = Object.assign(express(), { quiet: [] })
  app.use(express.json())
  const bot = new EventEmitter()
  bot.uin = 123456789
  bot.isOnline = () => true
  const raw =
    '{\n"view":"music","prompt":"[分享]测试","extra":"opaque-server-field","meta":{"music":{"appid":100497308,"title":"测试","desc":"歌手","jumpUrl":"https://example.com/song","musicUrl":"https://example.com/audio.mp3","preview":""}}\n}'
  bot.pickFriend = () => ({
    share: async () =>
      bot.emit('sync.message', {
        from_id: bot.uin,
        to_id: bot.uin,
        message: [{ type: 'json', data: raw }]
      })
  })
  const signer = new MusicSigner({ getBots: () => [bot], timeoutMs: 100 })
  t.after(() => signer.close())
  const unmount = await mountService(app, signer)
  t.after(unmount)
  const server = http.createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections()
        server.close(resolve)
      })
  )
  const url = `http://127.0.0.1:${server.address().port}/music_card/card`
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
  const app = Object.assign(express(), { quiet: [] })
  app.use(function hostAuth(req, res, next) {
    if (req.headers['x-host-key'] !== 'offline') return res.sendStatus(401)
    next()
  })
  app.use(express.json())
  const signer = { sign: async () => ({ view: 'music' }) }
  let unmount = await mountService(app, signer)
  // 与本机 Yunzai.run() 的末尾中间件一致。
  app.use((req) => req.res.redirect('/fallback'))
  await unmount()
  unmount = await mountService(app, signer)
  t.after(unmount)
  const server = http.createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections()
        server.close(resolve)
      })
  )
  const url = `http://127.0.0.1:${server.address().port}/music_card/card`
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/json', 'x-host-key': 'offline' },
    body: '{}'
  })
  assert.equal(response.status, 200)
  assert.equal((await fetch(url, { method: 'POST', body: '{}' })).status, 401)
})
