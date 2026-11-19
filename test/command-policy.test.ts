import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import type { Config } from '../src/types'
import { command, fixture } from './helpers/plugin'
import type { FixtureReply, FixtureResponse } from './helpers/plugin'

const signingId = '123456789'

for (const [name, settings, responds] of [
  [
    '关闭限制忽略两份名单',
    {
      commandBotMode: 'off',
      commandBotBlacklist: [signingId],
      commandBotWhitelist: []
    },
    true
  ],
  ['空黑名单允许响应', { commandBotMode: 'blacklist', commandBotBlacklist: [] }, true],
  ['黑名单命中静默', { commandBotMode: 'blacklist', commandBotBlacklist: [signingId] }, false],
  [
    '白名单命中且忽略未启用的黑名单',
    {
      commandBotMode: 'whitelist',
      commandBotBlacklist: [signingId],
      commandBotWhitelist: [signingId]
    },
    true
  ],
  ['白名单未命中静默', { commandBotMode: 'whitelist', commandBotWhitelist: ['234567890'] }, false],
  ['空白名单全部静默', { commandBotMode: 'whitelist', commandBotWhitelist: [] }, false]
] satisfies Array<[string, Partial<Config>, boolean]>) {
  test(`聊天指令 Bot 策略：${name}`, async (t) => {
    const { bot, testApp, cards, logs } = await fixture(t, settings)
    const replies: FixtureReply[] = []
    assert.equal(
      await testApp.probe({
        ...command('#音之测测'),
        self_id: bot.uin,
        reply: async (message) => {
          replies.push(message)
          return true
        }
      }),
      true
    )
    assert.equal(cards.length, responds ? 1 : 0)
    assert.equal(replies.length > 0, responds)
    if (!responds) {
      const log = logs.find(({ message }) => message.includes('已静默忽略'))
      assert.equal(log?.level, 'warn')
      assert.match(log!.message, /Bot=123456789.*指令=probe/)
      assert.match(log!.message, /要开启该 Bot 的聊天指令响应.*锅巴或 WebUI.*关闭限制/)
      assert.match(log!.message, /签名服务不受影响/)
      if (name === '空白名单全部静默') assert.match(log!.message, /白名单为空.*所有 Bot/)
    }
  })
}

test('受限 Bot 的全部聊天指令静默，HTTP、Handler 和允许的 OneBot 会话仍能使用它签名', async (t) => {
  const { bot, instance, manageApp, testApp, hostRoot, stack, cards, logs } = await fixture(t, {
    botId: signingId,
    commandBotMode: 'blacklist',
    commandBotBlacklist: [signingId]
  })
  const original = await readFile(join(hostRoot, 'config/music-card-sign.yaml'), 'utf8')
  const replies: FixtureReply[] = []
  const event = {
    ...command('#音之测测'),
    self_id: bot.uin,
    reply: async (message: FixtureReply) => {
      replies.push(message)
      return true
    }
  }
  for (const method of [
    'help',
    'status',
    'toggle',
    'setBot',
    'setTarget',
    'setPlatform',
    'setTimeout',
    'update'
  ] as const)
    assert.equal(await manageApp[method](event), true, method)
  for (const method of ['probe', 'forwardCard'] as const)
    assert.equal(await testApp[method](event), true, method)
  assert.equal(replies.length, 0)
  assert.equal(cards.length, 0)
  assert.equal(await readFile(join(hostRoot, 'config/music-card-sign.yaml'), 'utf8'), original)
  assert.equal(logs.filter(({ message }) => message.includes('已静默忽略')).length, 10)

  const request = {
    type: 'custom',
    self_id: signingId,
    title: '独立签名',
    url: 'https://example.com/song'
  }
  const raw = await instance.signCard({}, request, (message) => {
    throw new Error(message)
  })
  const response: FixtureResponse = {
    statusCode: 0,
    body: '',
    writeHead(code) {
      this.statusCode = code
    },
    end(body) {
      this.body = body
    }
  }
  await stack[1].handle({ url: '/', method: 'POST', headers: {}, body: request }, response)
  assert.equal(response.statusCode, 200)
  assert.equal(response.body, raw)
  assert.equal(cards.length, 1)
  const receiverId = 345678901
  Object.assign(Bot, {
    uin: [bot.uin, receiverId],
    [receiverId]: { adapter: { name: 'OneBotv11' } }
  })
  assert.equal(await testApp.probe({ ...event, self_id: receiverId }), true)
  assert.equal(cards.length, 2, '允许的 Bot 使用受限的签名 Bot 生成音卡')
  assert.deepEqual(replies[1], {
    type: 'raw',
    data: { type: 'json', data: { data: cards[1] } }
  })
  assert.match(String(replies.at(-1)), /音之测测通过/)
})

test('允许的 Bot 对非主人静默拒绝所有管理与发卡指令，只在日志中说明原因', async (t) => {
  const { bot, manageApp, testApp, cards, logs, hostRoot } = await fixture(t)
  const original = await readFile(join(hostRoot, 'config/music-card-sign.yaml'), 'utf8')
  const event = {
    ...command('#音之测测'),
    isMaster: false,
    self_id: bot.uin,
    user_id: 234567890,
    reply: async () => assert.fail('无权限时不得回复会话')
  }
  for (const method of [
    'status',
    'toggle',
    'setBot',
    'setTarget',
    'setPlatform',
    'setTimeout',
    'update'
  ] as const)
    assert.equal(await manageApp[method](event), true, method)
  for (const method of ['probe', 'forwardCard'] as const)
    assert.equal(await testApp[method](event), true, method)
  assert.equal(cards.length, 0)
  assert.equal(await readFile(join(hostRoot, 'config/music-card-sign.yaml'), 'utf8'), original)
  const denied = logs.filter(({ message }) => message.includes('已静默忽略'))
  assert.equal(denied.length, 9)
  assert.ok(denied.every(({ level, message }) => level === 'warn' && /仅主人可执行/.test(message)))
})
