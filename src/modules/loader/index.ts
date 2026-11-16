import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { AppsDir } from '@/dir'

type PluginClass = new () => plugin

export async function loadApps(directory = AppsDir, timeoutMs = 5000) {
  const files = (await fs.readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => entry.name)
    .toSorted()
  const results = await Promise.all(
    files.map(async (file) => {
      let timer: NodeJS.Timeout | undefined
      try {
        // 单文件导入不结束时先结束等待，避免拖到本体的整包加载超时。
        const module = await Promise.race([
          import(pathToFileURL(path.join(directory, file)).href) as Promise<
            Record<string, unknown>
          >,
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error(`应用导入超时（${timeoutMs} ms）`)),
              timeoutMs
            )
          })
        ])
        return { file, module, error: undefined }
      } catch (error) {
        return { file, module: null, error }
      } finally {
        clearTimeout(timer)
      }
    })
  )
  const apps: Record<string, PluginClass> = {}
  const failedFiles: Array<{ file: string; error: unknown }> = []
  for (const { file, module, error } of results) {
    if (!module) {
      failedFiles.push({ file, error })
      continue
    }
    const constructors = Object.entries(module).filter(
      (entry): entry is [string, PluginClass] =>
        typeof entry[1] === 'function' && entry[1].prototype instanceof plugin
    )
    const duplicate = constructors.find(([name]) => Object.hasOwn(apps, name))
    if (!constructors.length || duplicate) {
      failedFiles.push({
        file,
        error: new Error(duplicate ? `重复插件类：${duplicate[0]}` : '未导出继承 plugin 的应用类')
      })
      continue
    }
    Object.assign(apps, Object.fromEntries(constructors))
  }
  return { apps, failedFiles }
}
