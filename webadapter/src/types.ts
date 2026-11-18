import type { Config, MusicCard } from '../../src/types'

export interface PanelState {
  config: Omit<Config, 'apiKey'>
  hasApiKey: boolean
  platforms: string[]
  status: { enabled: boolean; bots: string[]; pending: number }
}

export interface SignResult {
  raw: string
  card: MusicCard
  elapsedMs: number
}
