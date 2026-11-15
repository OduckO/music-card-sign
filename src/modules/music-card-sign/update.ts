import fs from 'node:fs/promises'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { PluginName, PluginPath } from '@/dir'
import type { CommandEvent } from '@/types'
import { errorCode, errorMessage } from '@/utils'

interface HostUpdater {
  e: CommandEvent
  update: () => Promise<unknown>
  updateLog: () => Promise<unknown>
}

export async function updatePlugin(e: CommandEvent) {
  const action = e.msg.includes('日志') ? '更新日志' : e.msg.includes('强制') ? '强制更新' : '更新'
  logger.info(`[音卡更新] ${action} ${PluginName}`)
  try {
    const git = await fs.stat(join(PluginPath, '.git')).catch((error: unknown) => {
      if (errorCode(error) === 'ENOENT') return null
      throw error
    })
    if (!git) {
      await e.reply('当前插件缺少 .git，无法使用更新指令。请通过 Git 安装或手动替换 lib 分支文件。')
      return true
    }
    const { update: Update } = (await import(
      pathToFileURL(createRequire(import.meta.url).resolve('../../../../other/update')).href
    )) as { update: new () => HostUpdater }
    const updater = new Update()
    let replied = false
    updater.e = Object.create(Object.getPrototypeOf(e), {
      ...Object.getOwnPropertyDescriptors(e),
      msg: {
        value: `#${action}${PluginName}`,
        enumerable: true,
        writable: true,
        configurable: true
      },
      reply: {
        value: (...args: Parameters<CommandEvent['reply']>) => {
          replied = true
          return e.reply(...args)
        },
        enumerable: true,
        writable: true,
        configurable: true
      }
    }) as CommandEvent
    logger.info(`[音卡更新] 转交本体指令 ${updater.e.msg}`)
    const result = await (action === '更新日志' ? updater.updateLog() : updater.update())
    if (result === false) {
      const message = `本体更新器未执行${action}，请检查主人权限、插件目录或是否正在更新。`
      logger.warn(`[音卡更新] ${message}`)
      if (!replied) await e.reply(message)
    } else {
      logger.info(`[音卡更新] 本体${action}流程结束`)
    }
  } catch (error) {
    logger.error(`[音卡更新] ${action}失败：${errorMessage(error)}`, error)
    await e.reply(`音乐签名${action}失败：${errorMessage(error)}`)
  }
  return true
}
