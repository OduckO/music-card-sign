import type { MusicRequest, PlatformInput } from './music'

export interface Config {
  enabled: boolean
  botId: string
  targetId: string
  commandBotMode: 'off' | 'blacklist' | 'whitelist'
  commandBotBlacklist: string[]
  commandBotWhitelist: string[]
  defaultPlatform: string
  path: string
  timeoutMs: number
  localPort: number
  apiKey: string
  platforms: Record<string, PlatformInput>
  testMusic: MusicRequest
}
