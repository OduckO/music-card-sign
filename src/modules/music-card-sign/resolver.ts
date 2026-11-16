import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolveMusicInfo } from '@/models/music-info'
import type { MusicInfo, ResolveMusic, ResolverContext } from '@/types'

interface HostHandler {
  has: (key: string) => boolean
  call: (
    key: string,
    context: ResolverContext,
    data: { type: string; id: string }
  ) => Promise<MusicInfo>
}

export const resolveWithHandler: ResolveMusic = async (type, id, options = {}) => {
  if (Object.hasOwn(options.resolvers ?? {}, type)) return resolveMusicInfo(type, id, options)
  const { default: handler } = (await import(
    pathToFileURL(createRequire(import.meta.url).resolve('../../../../../lib/plugins/handler')).href
  )) as { default: HostHandler }
  const key = `music.info.${type}`
  if (!handler.has(key)) return resolveMusicInfo(type, id, options)
  return resolveMusicInfo(type, id, {
    ...options,
    resolvers: {
      ...options.resolvers,
      [type]: (songId, context) => handler.call(key, context, { type, id: songId })
    }
  })
}
