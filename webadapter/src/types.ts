import type { AccountOption, Config, MusicCard } from '../../src/types'

export interface PanelState {
  config: Omit<Config, 'apiKey'>
  hasApiKey: boolean
  accounts: AccountOption[]
  commandBots: AccountOption[]
  platforms: string[]
  status: { enabled: boolean; bots: string[]; pending: number }
}

export interface FriendList {
  botId: string
  friends: AccountOption[]
}

export interface SignResult {
  raw: string
  card: MusicCard
  elapsedMs: number
}
