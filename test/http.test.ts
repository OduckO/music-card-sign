import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import type { TestContext } from 'node:test'
import { createHandler, mountService } from '../src/models/http'
import { MusicSignError } from '../src/models/music-sign'
import type { ExpressHost } from '../src/models/http'
import type { HttpOptions, HttpSigner, MusicCard } from '../src/types'

async function localApi(t: TestContext, signer: HttpSigner, options: HttpOptions = {}) {
  const handler = createHandler(signer, options)
  const server = http.createServer(handler)
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
  return `http://127.0.0.1:${address.port}`
}

test('POST 的响应为卡片 JSON 正文，不带 data 包装', async (t) => {
  const ark: MusicCard = {
    app: 'com.tencent.structmsg',
    view: 'music',
    meta: { music: { title: '测试' } }
  }
  const api = await localApi(t, {
    sign: async (input) => {
      assert.deepEqual(input, { type: 'custom', title: '测试', _platform: '163' })
      return ark
    }
  })
  const response = await fetch(`${api}/music_card/card`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'custom', title: '测试', _platform: '163' })
  })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), ark)
})

test('请求错误与签名超时使用非 2xx，调用方可以按状态抛错', async (t) => {
  const api = await localApi(t, {
    sign: async () => {
      throw Object.assign(new Error('等待回传超时'), { status: 504 })
    }
  })
  const timeout = await fetch(`${api}/sign`, { method: 'POST', body: '{}' })
  assert.equal(timeout.status, 503)
  assert.match(timeout.headers.get('content-type') ?? '', /application\/json/)
  assert.deepEqual(await timeout.json(), { error: '等待回传超时', status: 504, request: {} })
  const invalid = await fetch(`${api}/sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{'
  })
  assert.equal(invalid.status, 400)
  const unknown = await fetch(`${api}/unknown`)
  assert.equal(unknown.status, 404)
})

test('签名失败的 JSON 和最后错误日志包含原请求体与未匹配字段', async (t) => {
  const request = {
    type: 'custom',
    title: '晴天',
    singer: '周杰伦',
    url: 'https://music.163.com/#/song?id=186016',
    audio: 'https://music.163.com/song/media/outer/url?id=186016.mp3',
    image: 'https://example.com/cover.jpg'
  }
  const logs: Array<{ level: string; message: string }> = []
  const api = await localApi(
    t,
    {
      sign: async () => {
        throw Object.assign(new MusicSignError('音卡回传字段不匹配：musicUrl', 502), {
          details: { fields: ['musicUrl'] }
        })
      }
    },
    { onLog: (level, message) => logs.push({ level, message }), apiKey: 'offline-secret' }
  )
  const response = await fetch(`${api}/music_card/card`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer offline-secret' },
    body: JSON.stringify(request)
  })
  assert.equal(response.status, 503)
  assert.match(response.headers.get('content-type') ?? '', /application\/json/)
  assert.deepEqual(await response.json(), {
    error: '音卡回传字段不匹配：musicUrl',
    status: 502,
    request,
    details: { fields: ['musicUrl'] }
  })
  const lastError = logs.findLast(({ level }) => level === 'error')?.message ?? ''
  assert.ok(lastError.includes(JSON.stringify(request)))
  assert.match(lastError, /musicUrl/)
  assert.ok(!logs.some(({ message }) => message.includes('offline-secret')))
})

test('可选 API 鉴权保护调用，健康检查不触发签名', async (t) => {
  const api = await localApi(
    t,
    {
      sign: async () => ({ view: 'music', meta: { music: {} } }),
      status: () => ({ enabled: true, bots: [], pending: 0 })
    },
    { apiKey: 'offline-test-key' }
  )
  assert.equal((await fetch(`${api}/sign`, { method: 'POST', body: '{}' })).status, 401)
  const allowed = await fetch(`${api}/sign`, {
    method: 'POST',
    headers: { Authorization: 'Bearer offline-test-key' },
    body: '{}'
  })
  assert.equal(allowed.status, 200)
  const health = await fetch(`${api}/health`)
  assert.equal(health.status, 200)
  assert.equal((await health.json()).pending, 0)
})

test('复用已有 Express app，卸载删除自己的路由和 quiet 前缀', async () => {
  const stack: Array<{ path: string; handle: Parameters<ExpressHost['use']>[1] }> = []
  const app: ExpressHost = {
    router: { stack },
    quiet: [],
    use(path, handle) {
      stack.push({ path, handle })
    }
  }
  const signer: HttpSigner = {
    sign: async () => ({ view: 'music', meta: { music: {} } }),
    status: () => ({ enabled: true, bots: [], pending: 0 })
  }
  const unmount = await mountService(app, signer, { path: '/music_card/card' })
  assert.equal(stack.length, 3)
  assert.equal(stack[0].path, '/music_card/card')
  assert.equal(app.quiet?.length, 1)
  await unmount()
  assert.equal(stack.length, 0)
  assert.equal(app.quiet?.length, 0)
})

test('非对象 JSON 与过大请求不进入签名流程', async (t) => {
  const api = await localApi(t, {
    sign: async () => {
      assert.fail('坏请求不应触发签名')
    }
  })
  for (const body of ['null', '[]', '"文字"']) {
    const response = await fetch(`${api}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    })
    assert.equal(response.status, 400)
  }
  const response = await fetch(`${api}/sign`, {
    method: 'POST',
    body: JSON.stringify({ title: 'x'.repeat(65536) })
  })
  assert.equal(response.status, 413)
})

test('独立 HTTP handler 接受配置的自定义签名路径', async (t) => {
  const api = await localApi(
    t,
    { sign: async () => ({ view: 'music', meta: { music: {} } }) },
    { path: '/custom/music' }
  )
  const response = await fetch(`${api}/custom/music`, { method: 'POST', body: '{}' })
  assert.equal(response.status, 200)
})

test('HTTP 入口记录收到请求、签名开始与响应状态，错误包含详情', async (t) => {
  const logs: Array<{ level: string; message: string }> = []
  const api = await localApi(
    t,
    {
      sign: async () => {
        assert.ok(logs.some(({ message }) => message.includes('开始签名')))
        throw Object.assign(new Error('等待本人 JSON 超时'), { status: 504 })
      }
    },
    { onLog: (level, message) => logs.push({ level, message }), apiKey: 'offline-secret' }
  )
  const response = await fetch(`${api}/sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer offline-secret' },
    body: '{}'
  })
  assert.equal(response.status, 503)
  assert.ok(logs.some(({ message }) => message.includes('收到 POST /sign')))
  assert.ok(
    logs.some(({ level, message }) => level === 'error' && message.includes('等待本人 JSON 超时'))
  )
  assert.ok(logs.some(({ message }) => message.includes('响应 503')))
  await fetch(`${api}/sign`)
  assert.ok(logs.some(({ message }) => message.includes('响应 401')))
  assert.ok(!logs.some(({ message }) => message.includes('offline-secret')))
})
