import { loadApps } from '@/modules/loader'
import { PluginName } from '@/dir'
import { errorMessage } from '@/utils'

logger.info(`[${PluginName}] 正在加载应用`)
const { apps, failedFiles } = await loadApps()
for (const { file, error } of failedFiles) {
  logger.error(`[${PluginName}] 应用 ${file} 加载失败：${errorMessage(error)}`, error)
}
if (!apps.MusicCardSign) {
  const failure = failedFiles.find(({ file }) => file === 'music-card-sign.js')
  throw new Error(
    `[${PluginName}] 音卡应用加载失败：${failure ? errorMessage(failure.error) : '未找到 MusicCardSign 导出'}`,
    { cause: failure?.error }
  )
}
logger.info(
  `[${PluginName}] 已加载 ${Object.keys(apps).length} 个应用，失败 ${failedFiles.length} 个文件`
)
export { apps }
