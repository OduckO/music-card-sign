import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fixture, command } from './helpers/plugin'
import type { FixtureReply, FixtureCommandEvent } from './helpers/plugin'

test('更新、强制更新和日志交给本体更新器，仅指定本插件并保留原事件', async (t) => {
  const { instance, hostRoot, directory, bot } = await fixture(t)
  assert.equal(typeof instance.update, 'function')
  const rule = instance.rule.find((entry) => entry.fnc === 'update')
  assert.equal(rule?.permission, 'master')
  assert.ok(rule)
  await mkdir(join(directory, '.git'))
  await mkdir(join(hostRoot, 'plugins/other'))
  await writeFile(
    join(hostRoot, 'plugins/other/update.js'),
    `export class update {
  async update() { return this.respond('update') }
  async updateLog() { return this.respond('updateLog') }
  async respond(method) {
    if (!this.e.isMaster) throw new Error('主人权限上下文丢失')
    await this.e.reply(JSON.stringify({ method, msg: this.e.msg, self_id: this.e.self_id }))
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
    const e: FixtureCommandEvent & { isMaster: boolean } = {
      isMaster: true,
      self_id: bot.uin,
      msg: entry.msg,
      reply: async (message: FixtureReply) => {
        replies.push(message)
        return true
      }
    }
    assert.equal(await instance.update(e), true)
    assert.equal(replies.length, 1)
    assert.deepEqual(JSON.parse(String(replies[0])), {
      method: entry.method,
      msg: entry.forwarded,
      self_id: bot.uin
    })
    assert.equal(e.msg, entry.msg, '转交更新器不能改动当前会话的原始指令')
  }
  assert.equal(new RegExp(rule.reg).test('#音乐签名强制更新日志'), false)
  assert.equal(new RegExp(rule.reg).test('#音乐签名更新其它插件'), false)
})

test('解压安装的更新请求提示缺少 Git，不调用本体更新器', async (t) => {
  const { instance, logs } = await fixture(t)
  assert.equal(typeof instance.update, 'function')
  const replies: FixtureReply[] = []
  await instance.update({
    msg: '#音乐签名更新',
    reply: async (message) => {
      replies.push(message)
      return true
    }
  })
  assert.match(String(replies[0]), /Git.*安装|缺少.*\.git/)
  assert.ok(!logs.some(({ level }) => level === 'error'))
})

test('本体更新器抛出的错误记录日志，并回到发指令的会话', async (t) => {
  const { instance, hostRoot, directory, logs } = await fixture(t)
  assert.equal(typeof instance.update, 'function')
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
  await instance.update({
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
  const { instance, directory, cards } = await fixture(t)
  assert.equal(typeof instance.update, 'function')
  await mkdir(join(directory, '.git'))
  const replies: FixtureReply[] = []
  await instance.update({
    msg: '#音乐签名更新',
    reply: async (message) => {
      replies.push(message)
      return true
    }
  })
  assert.match(String(replies.at(-1)), /更新失败/)
  await instance.probe(command('#音之测测'))
  assert.equal(cards.length, 1)
})
