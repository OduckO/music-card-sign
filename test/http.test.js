import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { createHandler, mountService } from '../lib/models/http.js'

async function localApi(t, signer, options = {}) {
  const handler = createHandler(signer, options)
  const server = http.createServer(handler)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  return `http://127.0.0.1:${server.address().port}`
}

test('LuckyLillia POST 的响应为卡片 JSON 正文，不带 data 包装', async t => {
  const ark = { app: 'com.tencent.structmsg', view: 'music', meta: { music: { title: '测试' } } }
  const api = await localApi(t, { sign: async input => {
    assert.deepEqual(input, { type: 'custom', title: '测试', _platform: '163' })
    return ark
  } })
  const response = await fetch(`${api}/music_card/card`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'custom', title: '测试', _platform: '163' })
  })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), ark)
})

test('请求错误与签名超时使用非 2xx，使 sign.ts 可以抛错', async t => {
  const api = await localApi(t, { sign: async () => { throw Object.assign(new Error('等待回传超时'), { status: 504 }) } })
  const timeout = await fetch(`${api}/sign`, { method: 'POST', body: '{}' })
  assert.equal(timeout.status, 504)
  assert.match(await timeout.text(), /超时/)
  const invalid = await fetch(`${api}/sign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })
  assert.equal(invalid.status, 400)
  const unknown = await fetch(`${api}/unknown`)
  assert.equal(unknown.status, 404)
})

test('可选 API 鉴权保护调用，健康检查不触发签名', async t => {
  const api = await localApi(t, {
    sign: async () => ({ view: 'music' }), status: () => ({ enabled: true, pending: 0 })
  }, { apiKey: 'offline-test-key' })
  assert.equal((await fetch(`${api}/sign`, { method: 'POST', body: '{}' })).status, 401)
  const allowed = await fetch(`${api}/sign`, {
    method: 'POST', headers: { Authorization: 'Bearer offline-test-key' }, body: '{}'
  })
  assert.equal(allowed.status, 200)
  const health = await fetch(`${api}/health`)
  assert.equal(health.status, 200)
  assert.equal((await health.json()).pending, 0)
})

test('复用已有 Express app，卸载删除自己的路由和 quiet 前缀', async () => {
  const stack = []
  const app = { router: { stack }, quiet: [], use(path, handle) { stack.push({ path, handle }) } }
  const signer = { status: () => ({ enabled: true }) }
  const unmount = await mountService(app, signer, { path: '/music_card/card' })
  assert.equal(stack.length, 1)
  assert.equal(stack[0].path, '/music_card/card')
  assert.equal(app.quiet.length, 1)
  await unmount()
  assert.equal(stack.length, 0)
  assert.equal(app.quiet.length, 0)
})

test('非对象 JSON 与过大请求不进入签名流程', async t => {
  const api = await localApi(t, { sign: async () => { assert.fail('坏请求不应触发签名') } })
  for (const body of ['null', '[]', '"文字"']) {
    const response = await fetch(`${api}/sign`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body
    })
    assert.equal(response.status, 400)
  }
  const response = await fetch(`${api}/sign`, {
    method: 'POST', body: JSON.stringify({ title: 'x'.repeat(65536) })
  })
  assert.equal(response.status, 413)
})

test('独立 HTTP handler 接受配置的自定义签名路径', async t => {
  const api = await localApi(t, { sign: async () => ({ view: 'music' }) }, { path: '/custom/music' })
  const response = await fetch(`${api}/custom/music`, { method: 'POST', body: '{}' })
  assert.equal(response.status, 200)
})
