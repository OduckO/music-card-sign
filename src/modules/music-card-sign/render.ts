import { readFile, rm } from 'node:fs/promises'
import { dirname, join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PluginPath, Path } from '@/dir'
import type { CommandEvent } from '@/types'
import { errorMessage } from '@/utils'

type TemplateRenderer = {
  renderTemplate: (
    route: string,
    data: unknown
  ) => Promise<{ success: boolean; htmlPath: string; error?: string }>
}

type HostRenderer = {
  default: {
    screenshot: (
      name: string,
      data: { tplFile: string; html: string; imgType: 'png'; saveId: string }
    ) => Promise<ReturnType<typeof segment.image> | false>
  }
}

let rendering = Promise.resolve()

export async function replyTemplate(
  e: Pick<CommandEvent, 'reply'>,
  route: 'music/help' | 'music/overview',
  data: unknown,
  fallback: string
) {
  // ktr 每个路由复用输出文件；截图完成后再处理下一次渲染。
  const result = rendering.then(async () => {
    const name = `music-card-sign/${route.split('/')[1]}`
    const hostFile = join(Path, 'temp/html', name, 'render.html')
    let templateFile: string | undefined
    try {
      const [template, host] = await Promise.all([
        import(
          pathToFileURL(join(PluginPath, 'lib/react-template/index.mjs')).href
        ) as Promise<TemplateRenderer>,
        import(
          pathToFileURL(join(Path, 'lib/puppeteer/puppeteer.js')).href
        ) as Promise<HostRenderer>
      ])
      const rendered = await template.renderTemplate(route, data)
      if (!rendered.success) throw new Error(rendered.error || '音卡模板渲染失败')
      templateFile = rendered.htmlPath
      const html = await readFile(templateFile, 'utf8')
      const base = pathToFileURL(`${dirname(templateFile)}${sep}`).href
      const image = await host.default.screenshot(name, {
        tplFile: join(PluginPath, 'resources/help/render.html'),
        html: html.replace(/<head([^>]*)>/i, `<head$1><base href="${base}">`),
        saveId: 'render',
        imgType: 'png'
      })
      if (!image) throw new Error('云崽截图服务未返回图片')
      return image
    } catch (error) {
      logger.warn(`[音卡图片] 生成失败：${errorMessage(error)}`)
      return fallback
    } finally {
      await Promise.all(
        [templateFile, hostFile].map(async (file) => {
          if (!file) return
          try {
            await rm(file, { force: true })
          } catch (error) {
            logger.warn(`[音卡图片] 清理临时 HTML 失败：${errorMessage(error)}`)
          }
        })
      )
    }
  })
  rendering = result.then(() => {})
  await e.reply(await result)
  return true
}
