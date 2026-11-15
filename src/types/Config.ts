import type { MusicRequest, PlatformInput } from './music'

export interface Config {
  enabled: boolean
  botId: string
  targetId: string
  path: string
  timeoutMs: number
  localPort: number
  apiKey: string
  platforms: Record<string, PlatformInput>
  testMusic: MusicRequest
}
