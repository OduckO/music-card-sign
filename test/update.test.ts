import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fixture, command } from './helpers/plugin'
import type { FixtureReply, FixtureCommandEvent } from './helpers/plugin'

test('更新、强制更新和日志交给本体更新器，仅指定本插件并保留原事件', async (t) => {
  const { hostRoot, directory, bot, logs, manageApp } = await fixture(t)
  assert.equal(typeof manageApp.update, 'function')
  const rule = manageApp.rule.find((entry) => entry.fnc === 'update')
  assert.equal(rule?.permission, undefined)
  assert.ok(rule)
  await mkdir(join(directory, '.git'))
  await mkdir(join(hostRoot, 'plugins/other'))
  await writeFile(
    join(hostRoot, 'plugins/other/update.js'),
    `export class update {
  async update() { return this.respond('update') }
  async updateLog() { return this.respond('updateLog') }
  async respond(method) {
    if (!this.e.isMaster) return false
    await this.e.reply(JSON.stringify({ method, msg: this.e.msg, self_id: this.e.self_id, logFnc: this.e.logFnc }))
  }
}
`
  )
  const cases = [
    { msg: '#音乐签名更新', method: 'update', forwarded: '#更新music-card-sign' },
    { msg: '#音乐签名强制更新', method: 'update', forwarded: '#强制更新music-card-sign' },
    { msg: '#音乐签名更新日志', method: 'updateLog', forwarded: '#更新日志music-card-sign' }
  ]
  for (const entry of cases) {
    assert.ok(new RegExp(rule.reg).test(entry.msg))
    const replies: FixtureReply[] = []
    class UpdateEvent implements FixtureCommandEvent {
      self_id = bot.uin

      constructor(public msg: string) {}

      async reply(message: FixtureReply) {
        assert.equal(this.self_id, bot.uin, '回复方法需要保留事件上下文')
        replies.push(message)
        return true
      }
    }
    const e: FixtureCommandEvent = new UpdateEvent(entry.msg)
    Object.defineProperty(e, 'isMaster', {
      value: true,
      writable: false,
      configurable: false
    })
    Object.defineProperty(e, 'logFnc', { value: '[1564571378][音乐签名更新]' })
    assert.equal(await manageApp.update(e), true)
    assert.equal(replies.length, 1)
    assert.deepEqual(JSON.parse(String(replies[0])), {
      method: entry.method,
      msg: entry.forwarded,
      self_id: bot.uin,
      logFnc: '[1564571378][音乐签名更新]'
    })
    assert.equal(e.msg, entry.msg, '转交更新器不能改动当前会话的原始指令')
  }
  assert.ok(!logs.some(({ level }) => level === 'error'))
  assert.equal(new RegExp(rule.reg).test('#音乐签名强制更新日志'), false)
  assert.equal(new RegExp(rule.reg).test('#音乐签名更新其它插件'), false)
})

test('解压安装的更新请求提示缺少 Git，不调用本体更新器', async (t) => {
  const { logs, manageApp } = await fixture(t)
  assert.equal(typeof manageApp.update, 'function')
  const replies: FixtureReply[] = []
  await manageApp.update({
    isMaster: true,
    msg: '#音乐签名更新',
    reply: async (message) => {
      replies.push(message)
      return true
    }
  })
  assert.match(String(replies[0]), /Git.*安装|缺少.*\.git/)
  assert.ok(!logs.some(({ level }) => level === 'error'))
})

test('本体拒绝更新时记录日志，未回复则提示，已回复则不重复', async (t) => {
  const { hostRoot, directory, logs, manageApp } = await fixture(t)
  await mkdir(join(directory, '.git'))
  await mkdir(join(hostRoot, 'plugins/other'))
  await writeFile(
    join(hostRoot, 'plugins/other/update.js'),
    `export class update {
  async update() {
    if (!this.e.isMaster) return false
    await this.e.reply('正在更新，请稍候再试')
    return false
  }
}
`
  )
  for (const isMaster of [false, true]) {
    const replies: FixtureReply[] = []
    const e: FixtureCommandEvent = {
      msg: '#音乐签名更新',
      reply: async (message) => {
        replies.push(message)
        return true
      }
    }
    Object.defineProperty(e, 'isMaster', { value: isMaster })
    assert.equal(await manageApp.update(e), true)
    assert.equal(replies.length, isMaster ? 1 : 0)
    if (isMaster) assert.equal(replies[0], '正在更新，请稍候再试')
    else assert.ok(logs.some(({ message }) => /静默忽略.*仅主人/.test(message)))
  }
  assert.equal(
    logs.filter(({ level, message }) => level === 'warn' && /本体更新器未执行/.test(message))
      .length,
    1
  )
})

test('本体更新器抛出的错误记录日志，并回到发指令的会话', async (t) => {
  const { hostRoot, directory, logs, manageApp } = await fixture(t)
  assert.equal(typeof manageApp.update, 'function')
  await mkdir(join(directory, '.git'))
  await mkdir(join(hostRoot, 'plugins/other'))
  await writeFile(
    join(hostRoot, 'plugins/other/update.js'),
    `export class update {
  async update() { throw new Error('远程仓库连接失败') }
}
`
  )
  const replies: FixtureReply[] = []
  await manageApp.update({
    isMaster: true,
    msg: '#音乐签名强制更新',
    reply: async (message) => {
      replies.push(message)
      return true
    }
  })
  assert.match(String(replies.at(-1)), /更新失败.*远程仓库连接失败/)
  assert.ok(
    logs.some(({ level, message }) => level === 'error' && /远程仓库连接失败/.test(message))
  )
})

test('宿主缺少更新器时音卡仍正常启动，执行更新时才报告错误', async (t) => {
  const { directory, cards, testApp, manageApp } = await fixture(t)
  assert.equal(typeof manageApp.update, 'function')
  await mkdir(join(directory, '.git'))
  const replies: FixtureReply[] = []
  await manageApp.update({
    isMaster: true,
    msg: '#音乐签名更新',
    reply: async (message) => {
      replies.push(message)
      return true
    }
  })
  assert.match(String(replies.at(-1)), /更新失败/)
  await testApp.probe(command('#音之测测'))
  assert.equal(cards.length, 1)
})
