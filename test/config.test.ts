import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import YAML from 'yaml'
import { fixture } from './helpers/plugin'
import type { Config } from '../src/types'

test('保存后重新加载歌曲配置，不补回默认歌曲或被清空的选填字段', async (t) => {
  const { directory, hostRoot } = await fixture(t, {}, { deferInit: true })
  const configPath = join(hostRoot, 'config/music-card-sign.yaml')
  for (const testMusic of [
    { type: '163', id: '123456' },
    { type: 'custom', title: '自选歌曲', url: 'https://example.com/song' }
  ]) {
    await writeFile(configPath, YAML.stringify({ testMusic }))
    const { default: loaded } = (await import(
      `${pathToFileURL(join(directory, 'lib/config/index.js')).href}?reload=${testMusic.type}`
    )) as { default: { config: Config } }
    assert.deepEqual(loaded.config.testMusic, testMusic)
    assert.deepEqual(YAML.parse(await readFile(configPath, 'utf8')).testMusic, testMusic)
    assert.equal(loaded.config.timeoutMs, 15000, '其他未设置的配置仍使用默认值')
  }
})
