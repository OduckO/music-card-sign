import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import YAML from 'yaml'
import { fixture } from './helpers/plugin'

test('超时指令按秒保存并立即显示，非法输入不修改配置', async (t) => {
  const { manageApp, hostRoot } = await fixture(t, {}, { noScreenshots: true })
  const configPath = join(hostRoot, 'config/music-card-sign.yaml')
  const replies: string[] = []
  const reply = async (message: string) => {
    replies.push(message)
    return true
  }
  const rule = manageApp.rule.find(({ fnc }) => fnc === 'setTimeout')
  assert.ok(rule)
  assert.equal(rule.permission, undefined)
  for (const [input, milliseconds] of [
    ['15', 15000],
    ['12.5秒', 12500],
    ['1.001 秒', 1001],
    ['0.001', 1],
    ['2147483.647', 2147483647]
  ] as const) {
    const msg = `#设置音乐签名超时 ${input}`
    assert.ok(new RegExp(rule.reg).test(msg))
    assert.equal(await manageApp.setTimeout({ isMaster: true, msg, reply }), true)
    const saved = YAML.parse(await readFile(configPath, 'utf8'))
    assert.equal(saved.timeoutMs, milliseconds)
    assert.equal(saved.enabled, true)
    assert.ok(replies.at(-1)!.includes(`回传超时已设为 ${milliseconds / 1000} 秒`))
    assert.ok(replies.at(-1)!.includes(`回传超时  ${milliseconds / 1000} 秒`))
  }
  const before = await readFile(configPath, 'utf8')
  for (const input of ['0', '-1', '0.0001', '2147483.648', 'NaN', 'Infinity', 'abc']) {
    await manageApp.setTimeout({ isMaster: true, msg: `#设置音乐签名超时 ${input}`, reply })
    assert.match(replies.at(-1)!, /回传超时须为.*秒/)
    assert.equal(await readFile(configPath, 'utf8'), before)
  }
  await manageApp.setTimeout({ isMaster: true, msg: '#设置音乐签名超时', reply })
  assert.match(replies.at(-1)!, /用法.*12\.5/)
  assert.equal(await readFile(configPath, 'utf8'), before)
})
