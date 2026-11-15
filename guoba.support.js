import { supportGuoba as createSupport } from './lib/modules/guoba/index.js'

export function supportGuoba() {
  logger.info('[音卡签名] 锅巴读取插件配置')
  return createSupport()
}
