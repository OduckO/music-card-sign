import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import YAML from 'yaml'
import { Path, PluginName, PluginPath, ResPath } from '@/dir'
import { errorCode } from '@/utils'
import type { Config } from '@/types'
import type MakeConfig from '../../../../lib/plugins/config'

// 宿主模块不在插件构建目录内，由 Node 解析实际文件路径。
const { default: makeConfig } = (await import(
  pathToFileURL(createRequire(import.meta.url).resolve('../../../../lib/plugins/config')).href
)) as { default: typeof MakeConfig }

class PluginConfig {
  config!: Config
  configSave!: () => Promise<void>

  async initCfg() {
    const defaults: Config = YAML.parse(
      await fs.readFile(path.join(ResPath, 'config/config.yaml'), 'utf8')
    )
    const target = path.join(Path, 'config', `${PluginName}.yaml`)
    // 旧 JSON 只在 YAML 尚不存在时迁移，旧文件留在原处。
    try {
      await fs.access(target)
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error
      try {
        const legacy = JSON.parse(
          await fs.readFile(path.join(PluginPath, 'config/config/config.json'), 'utf8')
        )
        Object.assign(defaults, legacy)
        await fs.mkdir(path.dirname(target), { recursive: true })
        await fs.writeFile(target, YAML.stringify(defaults), { flag: 'wx' })
      } catch (legacyError) {
        if (errorCode(legacyError) !== 'ENOENT' && errorCode(legacyError) !== 'EEXIST')
          throw legacyError
      }
    }
    const result = await makeConfig(PluginName, defaults, {}, { watch: false })
    this.config = result.config
    this.configSave = result.configSave
    if (
      !Number.isInteger(this.config.localPort) ||
      this.config.localPort < 0 ||
      this.config.localPort > 65535
    ) {
      throw new Error('localPort 必须是 0 或有效端口号')
    }
    return this
  }
}

export default await new PluginConfig().initCfg()
