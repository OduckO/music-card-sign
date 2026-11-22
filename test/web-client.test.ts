import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'

test('面板请求在连接或响应体超时后停止，后续请求仍可正常完成', async (t) => {
  const requests: string[] = []
  const server = createServer((req, res) => {
    requests.push(req.url!)
    assert.equal(req.headers['guoba-access-token'], 'panel-test-token')
    if (req.url === '/panel/api/hang-headers') return
    res.setHeader('Content-Type', 'application/json')
    if (req.url === '/panel/api/hang-body') {
      res.write('{"ok":')
      return
    }
    if (req.url === '/panel/api/error') {
      res.writeHead(503)
      res.end(JSON.stringify({ ok: false, error: '等待音卡回传超时', status: 504 }))
      return
    }
    if (req.url === '/panel/api/html') {
      res.writeHead(502, { 'Content-Type': 'text/html' })
      res.end('<!doctype html><p>upstream error</p>')
      return
    }
    res.end(JSON.stringify({ ok: true, result: { enabled: true } }))
  })
  server.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  Object.defineProperty(globalThis, 'location', {
    value: new URL(`http://127.0.0.1:${address.port}/?__apiBase=/panel/api&token=panel-test-token`),
    configurable: true
  })
  t.after(() => {
    Reflect.deleteProperty(globalThis, 'location')
    server.closeAllConnections()
    server.close()
  })
  const { api } = await import('../webadapter/src/api')
  for (const path of ['/hang-headers', '/hang-body']) {
    await t.test(`${path} 超时取消且不重试`, async () => {
      await assert.rejects(api(path, undefined, 100), /请求超时.*已停止等待/)
      assert.equal(requests.filter((url) => url === `/panel/api${path}`).length, 1)
      assert.deepEqual(await api('/ok'), { enabled: true })
    })
  }
  await t.test('服务端 JSON 错误直接显示，不转为客户端超时', async () => {
    await assert.rejects(api('/error'), /等待音卡回传超时/)
    assert.equal(requests.filter((url) => url === '/panel/api/error').length, 1)
  })
  await t.test('代理 HTML 错误结束请求并明确提示', async () => {
    await assert.rejects(api('/html'), /非 JSON 内容（HTTP 502）/)
  })
})
