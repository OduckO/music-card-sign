import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import type { PanelState } from '../webadapter/src/types'

test('WebUI 导航、草稿和保存后的配置在两个宿主与屏幕尺寸下保持一致', async (t) => {
  const files = new Map<string, { type: string; body: Buffer }>()
  for (const [url, file, type] of [
    ['/', 'panel.html', 'text/html'],
    ['/app.js', 'app.js', 'text/javascript'],
    ['/app.css', 'app.css', 'text/css']
  ]) {
    files.set(url, { type, body: await readFile(`webadapter/${file}`) })
  }
  const server = createServer((req, res) => {
    const file = files.get(new URL(req.url!, 'http://localhost').pathname)
    res.writeHead(file ? 200 : 404, {
      'Content-Type': `${file?.type ?? 'text/plain'}; charset=utf-8`
    })
    res.end(file?.body)
  })
  server.listen(0, '127.0.0.1')
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())))
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const origin = `http://127.0.0.1:${address.port}`
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL })
  t.after(() => browser.close())

  for (const host of ['webadapter', 'guoba']) {
    for (const width of [390, 1440]) {
      await t.test(`${host} ${width}px`, async (scenario) => {
        const page = await browser.newPage({ viewport: { width, height: 900 } })
        scenario.after(() => page.close())
        const errors: string[] = []
        page.on('pageerror', (error) => errors.push(error.message))
        page.setDefaultTimeout(5000)
        const state: PanelState = {
          config: {
            enabled: true,
            botId: '',
            targetId: '',
            commandBotMode: 'off',
            commandBotBlacklist: [],
            commandBotWhitelist: [],
            defaultPlatform: 'default',
            path: '/music_card/card',
            timeoutMs: 15000,
            localPort: 0,
            platforms: {},
            testMusic: { type: 'custom', title: '测试歌曲', url: 'https://example.com/song' }
          },
          hasApiKey: false,
          accounts: [],
          commandBots: [],
          platforms: ['default', 'qq'],
          status: { enabled: true, bots: [], pending: 0 }
        }
        let delay: 'success' | 'error' | undefined
        let held: PromiseWithResolvers<void> | undefined
        let arrived = Promise.withResolvers<void>()
        const posted: unknown[] = []
        await page.route('**/config', async (route) => {
          if (route.request().method() === 'POST') {
            const patch = route.request().postDataJSON()
            posted.push(patch)
            Object.assign(state.config, patch)
            state.status.enabled = state.config.enabled
            await route.fulfill({ json: { ok: true, result: { message: '设置已保存' } } })
            return
          }
          const snapshot = structuredClone(state)
          const failure = delay === 'error'
          if (delay) {
            delay = undefined
            held = Promise.withResolvers<void>()
            arrived.resolve()
            await held.promise
          }
          await route.fulfill(
            failure
              ? { status: 503, json: { ok: false, error: '旧请求失败' } }
              : { json: { ok: true, result: snapshot } }
          )
        })
        await page.goto(
          `${origin}/?${host === 'guoba' ? '__apiBase=/guoba/api&token=test' : '__webBase='}`
        )
        const settingsTab = page.getByRole('tab', { name: '服务设置', exact: true })
        const signTab = page.getByRole('tab', { name: '请求音卡', exact: true })
        await settingsTab.waitFor()

        // 模拟缺少动效 API 的旧 WebView，导航不依赖它们。
        await page.evaluate(() => {
          Object.defineProperty(Element.prototype, 'getAnimations', { value: undefined })
        })
        const botInput = page.getByRole('combobox', { name: '签名 Bot', exact: true })
        await botInput.fill('123456789')
        await signTab.click()
        const jsonInput = page.getByRole('textbox', { name: '请求 JSON', exact: true })
        await jsonInput.fill('{"title":"尚未提交的草稿"}')
        await signTab.press('Home')
        assert.equal(await settingsTab.getAttribute('aria-selected'), 'true')
        assert.equal(await botInput.inputValue(), '123456789')
        await settingsTab.press('End')
        assert.equal(await jsonInput.inputValue(), '{"title":"尚未提交的草稿"}')
        await signTab.press('ArrowLeft')

        for (const outcome of ['success', 'error'] as const) {
          delay = outcome
          arrived = Promise.withResolvers<void>()
          await signTab.click()
          await arrived.promise
          assert.equal(await signTab.getAttribute('aria-selected'), 'true', '刷新等待不阻塞切换')
          await settingsTab.click()
          await page.locator('#panel-settings .switch-row').first().click()
          const enabled = outcome !== 'success'
          const savedResponse = page.waitForResponse(
            (response) =>
              response.url().endsWith('/config') && response.request().method() === 'GET'
          )
          await page.getByRole('button', { name: '保存设置', exact: true }).first().click()
          await savedResponse
          await page.getByText('设置已保存', { exact: true }).waitFor()
          await page.getByRole('button', { name: '保存设置', exact: true }).first().waitFor()
          const oldResponse = page.waitForResponse(
            (response) =>
              response.url().endsWith('/config') && response.request().method() === 'GET'
          )
          held!.resolve()
          await oldResponse
          await page.evaluate(
            () =>
              new Promise<void>((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
              )
          )
          assert.equal(
            await page.locator('#panel-settings .switch-row input').first().isChecked(),
            enabled
          )
          assert.equal(state.config.enabled, enabled)
          assert.equal(await page.getByText('旧请求失败', { exact: false }).count(), 0)
          assert.equal(
            await page.locator('.service-state').innerText(),
            enabled ? '签名服务已开启' : '签名服务未开启'
          )
        }
        assert.equal(posted.length, 2)
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          true
        )
        assert.deepEqual(errors, [])
      })
    }
  }
})
