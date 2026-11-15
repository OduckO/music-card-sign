import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { AppsDir, PluginName } from '@/dir'

type PluginClass = new () => plugin

export async function loadApps () {
  const apps: Record<string, PluginClass> = {}
  for (const file of await getJsFilePaths(AppsDir)) {
    const module = await import(pathToFileURL(file).href)
    for (const [name, value] of Object.entries(module)) {
      if (typeof value !== 'function' || !(value.prototype instanceof plugin)) continue
      if (apps[name]) throw new Error(`[${PluginName}] 重复插件类：${name}`)
      apps[name] = value as PluginClass
    }
  }
  logger.info(`[${PluginName}] 已加载 ${Object.keys(apps).length} 个插件`)
  return { apps }
}

async function getJsFilePaths (directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async entry => {
    const filename = path.join(directory, entry.name)
    return entry.isDirectory() ? getJsFilePaths(filename) : entry.name.endsWith('.js') ? [filename] : []
  }))
  return files.flat().sort()
}
