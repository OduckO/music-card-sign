import type { IncomingMessage } from 'node:http'
import type { EventEmitter } from 'node:events'

export interface AppPlatform {
  appid: number
  appname: string
  appsign: string
}

export interface PlatformInput {
  appid: number | string
  appname: string
  appsign?: string
  app_sign?: string
}

export interface MusicRequest extends Record<string, unknown> {
  type?: string
  id?: string | number
  self_id?: string | number
  bot_id?: string | number
  _platform?: string | PlatformInput
  platform?: string | PlatformInput
  source?: string
  title?: string | number
  song?: string | number
  name?: string | number
  singer?: string | number | null
  artist?: string | number
  content?: string | number
  desc?: string | number
  prompt?: string
  url?: string
  jump?: string
  jumpUrl?: string
  link?: string
  audio?: string
  voice?: string
  musicUrl?: string
  image?: string
  cover?: string
  pic?: string
}

export interface MusicInfo {
  title: string
  singer: string
  url: string
  audio: string
  image?: string
}

export interface ShareContent {
  type: 'share'
  title: string
  summary: string
  content: string
  url: string
  audio: string
  image: string
}

export interface NormalizedRequest {
  selfId: string
  platform: AppPlatform
  content: ShareContent
}

export interface MusicCard extends Record<string, unknown> {
  view: 'music'
  prompt?: string
  extra?: string | { appid?: string | number } | null
  meta: {
    music: {
      appid?: string | number
      title?: string
      desc?: string
      jumpUrl?: string
      musicUrl?: string
      preview?: string
    }
  }
}

export interface MusicEvent {
  message?: Array<{ type: string, data?: unknown }>
  message_type?: string
  self_id?: string | number
  group_id?: string | number
  from_id?: string | number
  user_id?: string | number
  to_id?: string | number
  sender?: { user_id?: string | number }
  time?: number
}

export interface IcqqBot extends EventEmitter {
  uin: number
  isOnline?: () => boolean
  online?: boolean
  pickFriend: (id: number) => { share: (content: ShareContent, platform: AppPlatform) => Promise<unknown> }
}

export interface BotAdapter {
  sdk?: IcqqBot
  adapter?: { name: string }
}

export type BotCandidate = IcqqBot | BotAdapter

// 平台 JSON 在各自解析器中检查返回码、歌曲 ID 和必需字段。
export type ApiResponse = Record<string, any>
export type JsonFetcher = (endpoint: string, params?: Record<string, string>, options?: RequestInit) => Promise<ApiResponse>
export type MusicFetch = (input: string | URL, options?: RequestInit) => Promise<Response>

export interface ResolverContext {
  type: string
  signal: AbortSignal
  timeoutMs: number
  fetchImpl: MusicFetch
  json: JsonFetcher
}

export type MusicResolver = (id: string, context: ResolverContext) => MusicInfo | Promise<MusicInfo>
export interface ResolveOptions {
  fetchImpl?: MusicFetch
  timeoutMs?: number
  resolvers?: Record<string, MusicResolver>
}
export type ResolveMusic = (type: string, id: string | number, options?: ResolveOptions) => Promise<MusicInfo>
export interface SignOptions { forceFresh?: boolean }

export interface CacheRecord {
  version: 1
  key: string
  request: NormalizedRequest
  raw: string
}

export interface CardCache {
  get: (key: string) => Promise<CacheRecord | null>
  set: (key: string, raw: string, request: NormalizedRequest) => Promise<void>
}

export interface SignerOptions {
  getBots: () => BotCandidate[]
  botId?: string | number
  timeoutMs?: number
  customPlatforms?: Record<string, PlatformInput>
  resolveMusic?: ResolveMusic
  cache?: CardCache
  onCacheError?: (error: unknown) => void
}

export interface PendingRequest {
  request: NormalizedRequest
  started: number
  timer?: NodeJS.Timeout
  finish: (error?: Error | null, card?: MusicCard) => void
}

export interface Subscription {
  items: Set<PendingRequest>
  listener: (event: MusicEvent) => void
}

export interface HttpSigner {
  sign: (input: MusicRequest) => Promise<MusicCard>
  status?: () => { enabled: boolean, bots: string[], pending: number }
}

export interface HttpOptions {
  apiKey?: string
  path?: string
  mounted?: boolean
  localPort?: number
}

export interface HttpRequest extends IncomingMessage { body?: unknown }

export interface CommandEvent {
  msg: string
  self_id?: string | number
  reply: (data: string | { type: 'json', data: string }) => Promise<unknown>
}
