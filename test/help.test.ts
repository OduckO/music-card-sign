import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { command, fixture, type FixtureReply } from './helpers/plugin'

test('帮助按需渲染 React 图片，服务尚未初始化时也能使用', async (t) => {
  const { manageApp, screenshots, directory, hostRoot, stack } = await fixture(
    t,
    { defaultPlatform: 'kugou_concept' },
    { deferInit: true }
  )
  const replies: FixtureReply[] = []
  const event = {
    ...command('#音乐签名帮助'),
    reply: async (message: FixtureReply) => {
      replies.push(message)
      return { message_id: [1] }
    }
  }
  assert.equal(await manageApp.help(event), true)
  assert.deepEqual(replies, [{ type: 'image', file: 'base64://help-preview' }])
  assert.equal(stack.length, 0, '帮助不应启动签名服务')
  assert.equal(screenshots.length, 1)
  const [{ name, data }] = screenshots
  assert.equal(name, 'music-card-sign/help')
  assert.equal(data.tplFile, join(directory, 'resources/help/render.html'))
  assert.equal(await readFile(data.tplFile, 'utf8'), '{{@html}}\n')
  assert.match(data.html, /<html/)
  assert.match(data.html, /#音之测测/)
  assert.match(data.html, /kugou_concept/)
  assert.match(data.html, /audio、singer、image 可空/)
  assert.equal([...data.html.matchAll(/class="menu-group"/g)].length, 3)
  assert.equal([...data.html.matchAll(/<svg[^>]*class="[^"]*\bcommand-icon\b/g)].length, 11)
  assert.doesNotMatch(data.html, /#音乐签名设置/)
  assert.match(data.html, /<style[^>]*>[\s\S]*\.help-poster/)
  assert.match(data.html, /<base href="file:/)
  assert.match(data.html, /file:.*HarmonyOS_Sans_SC_Regular\.woff2/)
  assert.match(data.html, /file:.*HarmonyOS_Sans_SC_Bold\.woff2/)
  assert.doesNotMatch(data.html, /data:font\/woff2/)
  assert.doesNotMatch(data.html, /hero-art|clip-path="[^"]*-wings"/)
  assert.deepEqual(
    (await readdir(join(directory, 'lib/react-template/html'))).filter(
      (filename) => filename === 'music_help.html'
    ),
    []
  )
  assert.deepEqual(await readdir(join(hostRoot, 'temp/html/music-card-sign/help')), [])
  const text = data.html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]*>/g, '')
  assert.doesNotMatch(text, /编织转瞬即逝|短暂成形|须臾的集合|MUSIC CARD SIGN/)
  assert.doesNotMatch(text, /music-card-sign|github\.com\/OduckO/i)
  assert.doesNotMatch(data.html, /class="spiral-art"/)
  assert.match(data.html, /<h1>音乐签名使用帮助<\/h1>/)
  assert.match(data.html, /class="help-emblem"/)
})

test('截图失败会返回同一组文字帮助，下一次请求仍能出图', async (t) => {
  const { manageApp, hostRoot, logs } = await fixture(t, {}, { deferInit: true })
  const renderer = (await import(
    pathToFileURL(join(hostRoot, 'lib/puppeteer/puppeteer.js')).href
  )) as {
    default: { screenshot: () => Promise<{ type: 'image'; file: string }> }
  }
  const screenshot = renderer.default.screenshot
  renderer.default.screenshot = async () => {
    renderer.default.screenshot = screenshot
    throw new Error('截图浏览器未就绪')
  }
  const replies: FixtureReply[] = []
  const event = {
    ...command('#音乐签名帮助'),
    reply: async (message: FixtureReply) => {
      replies.push(message)
      return { message_id: [1] }
    }
  }
  await Promise.all([manageApp.help(event), manageApp.help(event)])
  assert.match(String(replies[0]), /#音之测测/)
  assert.match(String(replies[0]), /必填 title\/url；audio、singer、image 可空/)
  assert.deepEqual(replies[1], { type: 'image', file: 'base64://help-preview' })
  assert.ok(logs.some(({ message }) => message.includes('截图浏览器未就绪')))
})

test('只保留状态指令，状态图显示当前配置且不泄露 API Key', async (t) => {
  const { manageApp, screenshots } = await fixture(t, {
    apiKey: 'private-test-key',
    defaultPlatform: 'kugou_concept',
    botId: '123456789',
    targetId: '234567890'
  })
  const rule = manageApp.rule.find(({ fnc }) => fnc === 'status')
  assert.equal(rule?.permission, 'master')
  assert.ok(rule && new RegExp(rule.reg).test('#音乐签名状态'))
  assert.ok(!manageApp.rule.some(({ reg }) => new RegExp(reg).test('#音乐签名设置')))
  const replies: FixtureReply[] = []
  const event = (msg: string) => ({
    ...command(msg),
    reply: async (message: FixtureReply) => {
      replies.push(message)
      return true
    }
  })
  await Promise.all([
    manageApp.status(event('#音乐签名状态')),
    manageApp.help(event('#音乐签名帮助'))
  ])
  assert.equal(replies.length, 2)
  assert.ok(replies.every((reply) => typeof reply !== 'string' && reply.type === 'image'))
  const overview = screenshots.filter(({ name }) => name.endsWith('/overview'))
  assert.equal(overview.length, 1)
  assert.match(overview[0].data.html, /音卡状态/)
  for (const { data } of overview) {
    assert.match(data.html, /123456789/)
    assert.match(data.html, /234567890/)
    assert.match(data.html, /kugou_concept/)
    assert.match(data.html, /已设置/)
    assert.match(data.html, /class="snapshot-switch" data-on="true"/)
    assert.match(data.html, /class="snapshot-select"/)
    assert.doesNotMatch(data.html, /class="spiral-art"/)
    assert.ok(
      [...data.html.matchAll(/<dt>[\s\S]*?<\/dt>/g)].every(
        ([label]) => !/[：:]/.test(label.replace(/<[^>]*>/g, ''))
      )
    )
    assert.doesNotMatch(data.html, /private-test-key/)
    assert.doesNotMatch(data.html, /hero-art|clip-path="[^"]*-wings"/)
  }
  await manageApp.setPlatform(event('#设置音乐签名平台 default'))
  assert.match(screenshots.at(-1)!.data.html, /已设为 default/)
  assert.ok(typeof replies.at(-1) !== 'string')
})
