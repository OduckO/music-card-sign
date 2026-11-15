import type {
  ApiResponse,
  JsonFetcher,
  MusicFetch,
  MusicInfo,
  MusicResolver,
  ResolverContext,
  ResolveOptions
} from '@/types'

const PLATFORMS = new Set(['qq', '163', 'kugou', 'kuwo', 'migu'])

function musicError(code: string, type: unknown, message: string, cause?: unknown) {
  const error = Object.assign(
    new Error(`${type}: ${message}`, cause === undefined ? undefined : { cause }),
    { code, platform: type, status: undefined as number | undefined }
  )
  error.code = code
  error.platform = type
  return error
}

function httpUrl(value: unknown, type: string, field: string) {
  if (typeof value !== 'string') {
    throw musicError('ERR_MUSIC_URL', type, `${field} 必须是 HTTP(S) URL`)
  }
  const text = value.trim().replace(/^\/\//, 'https://')
  let url
  try {
    url = new URL(text)
  } catch {
    throw musicError('ERR_MUSIC_URL', type, `${field} 不是有效的 HTTP(S) URL`)
  }
  if (!/^https?:\/\//i.test(text) || !['http:', 'https:'].includes(url.protocol)) {
    throw musicError('ERR_MUSIC_URL', type, `${field} 只允许 HTTP(S) URL`)
  }
  return url.href
}

function sameId(left: unknown, right: string) {
  const a = String(left ?? '')
  const b = String(right)
  return /^\d+$/.test(a) && /^\d+$/.test(b)
    ? a.replace(/^0+(?=\d)/, '') === b.replace(/^0+(?=\d)/, '')
    : a === b
}

function checkCode(data: ApiResponse, type: string, success: number): ApiResponse {
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    (data.code !== undefined && String(data.code) !== String(success))
  ) {
    throw musicError('ERR_MUSIC_RESPONSE', type, '官方接口返回失败或无效响应')
  }
  return data
}

function metadataError(type: string) {
  return musicError('ERR_MUSIC_METADATA', type, '官方接口未返回与 ID 匹配的歌曲信息')
}

function audioError(type: string) {
  return musicError(
    'ERR_MUSIC_AUDIO_UNAVAILABLE',
    type,
    '官方公开接口未返回可用音频 URL；可能需要登录、版权授权或配置 resolvers 覆盖'
  )
}

function validateInfo(info: MusicInfo, type: string): MusicInfo {
  if (
    !info ||
    typeof info.title !== 'string' ||
    !info.title.trim() ||
    typeof info.singer !== 'string' ||
    !info.singer.trim()
  ) {
    throw metadataError(type)
  }
  if (info.audio === undefined || info.audio === null || info.audio === '') throw audioError(type)
  return {
    title: info.title.trim(),
    singer: info.singer.trim(),
    url: httpUrl(info.url, type, 'url'),
    audio: httpUrl(info.audio, type, 'audio'),
    image:
      info.image === undefined || info.image === null || info.image === ''
        ? ''
        : httpUrl(info.image, type, 'image')
  }
}

// QQ: fcg_play_single_song -> CgiGetVkey -> response sip + matching purl.
async function qq(id: string, { json }: ResolverContext): Promise<MusicInfo> {
  const type = 'qq'
  const key = /^\d+$/.test(id) ? 'songid' : 'songmid'
  const detail = checkCode(
    await json('https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg', {
      [key]: id,
      format: 'json',
      platform: 'yqq.json'
    }),
    type,
    0
  )
  const song =
    Array.isArray(detail.data) &&
    detail.data.find(
      (item: ApiResponse) =>
        item && sameId(key === 'songid' ? (item.id ?? item.songid) : (item.mid ?? item.songmid), id)
    )
  const mid = song?.mid ?? song?.songmid
  if (!song || typeof mid !== 'string' || !/^[a-z\d]+$/i.test(mid)) throw metadataError(type)
  const response = checkCode(
    await json(
      'https://u.y.qq.com/cgi-bin/musicu.fcg',
      {},
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comm: { ct: 24, cv: 0, format: 'json', uin: 0 },
          req_0: {
            module: 'vkey.GetVkeyServer',
            method: 'CgiGetVkey',
            param: {
              guid: String(Date.now()),
              songmid: [mid],
              songtype: [0],
              uin: '0',
              loginflag: 1,
              platform: '20'
            }
          }
        })
      }
    ),
    type,
    0
  )
  const vkey = checkCode(response.req_0, type, 0).data
  const item =
    Array.isArray(vkey?.midurlinfo) &&
    vkey.midurlinfo.find((entry: ApiResponse) => entry?.songmid === mid)
  const purl = item?.purl
  if (typeof purl !== 'string' || !purl.trim()) throw audioError(type)
  let audio
  if (/^[a-z][a-z\d+.-]*:/i.test(purl)) {
    audio = httpUrl(purl, type, 'audio')
  } else {
    const origin =
      Array.isArray(vkey?.sip) &&
      vkey.sip.find((value: unknown) => typeof value === 'string' && value.trim())
    if (!origin) throw audioError(type)
    audio = new URL(purl, httpUrl(origin, type, 'audio origin')).href
  }
  const album = song.album
  const image =
    album?.picUrl ||
    (typeof album?.mid === 'string' && /^[a-z\d]+$/i.test(album.mid)
      ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${album.mid}.jpg`
      : '')
  return {
    title: song.title || song.name,
    singer: Array.isArray(song.singer)
      ? song.singer
          .map((artist: ApiResponse) => artist?.name)
          .filter(Boolean)
          .join(' / ')
      : '',
    url: `https://y.qq.com/n/ryqq/songDetail/${mid}`,
    audio,
    image
  }
}

// 163: song/detail -> song/enhance/player/url; no guessed song/media/outer URL.
async function netease(id: string, { json }: ResolverContext): Promise<MusicInfo> {
  const type = '163'
  const ids = JSON.stringify([id])
  const detail = checkCode(await json('https://music.163.com/api/song/detail', { ids }), type, 200)
  const song =
    Array.isArray(detail.songs) &&
    detail.songs.find((item: ApiResponse) => item && sameId(item.id, id))
  if (!song) throw metadataError(type)
  const response = checkCode(
    await json('https://music.163.com/api/song/enhance/player/url', {
      ids,
      br: '128000'
    }),
    type,
    200
  )
  const audio =
    Array.isArray(response.data) &&
    response.data.find((item: ApiResponse) => item && sameId(item.id, id))
  if (!audio || (audio.code !== undefined && String(audio.code) !== '200')) throw audioError(type)
  const artists = song.artists ?? song.ar
  return {
    title: song.name,
    singer: Array.isArray(artists)
      ? artists
          .map((item: ApiResponse) => item?.name)
          .filter(Boolean)
          .join(' / ')
      : '',
    url: `https://music.163.com/song?id=${id}`,
    audio: audio.url,
    image: (song.album ?? song.al)?.picUrl
  }
}

// Kugou: mobile playInfo returns songName/singerName/url/imgUrl for the requested hash.
async function kugou(id: string, { json }: ResolverContext): Promise<MusicInfo> {
  const type = 'kugou'
  const song = await json('https://m.kugou.com/app/i/getSongInfo.php', {
    cmd: 'playInfo',
    hash: id
  })
  if (!song || (song.status !== undefined && String(song.status) !== '1')) {
    throw musicError('ERR_MUSIC_RESPONSE', type, '官方 playInfo 接口返回失败')
  }
  if (song.hash !== undefined && String(song.hash).toLowerCase() !== id.toLowerCase())
    throw metadataError(type)
  const image = song.trans_param?.union_cover || song.album_img || song.imgUrl
  return {
    title: song.songName,
    singer: song.singerName || song.author_name,
    url: `https://www.kugou.com/song/#hash=${id}`,
    audio: song.url,
    image: typeof image === 'string' ? image.replace(/\{size\}/g, '400') : image
  }
}

// Kuwo: musicInfo -> playUrl. Public web APIs may require cookies/CSRF on live servers.
async function kuwo(id: string, { json }: ResolverContext): Promise<MusicInfo> {
  const type = 'kuwo'
  const detail = checkCode(
    await json('https://www.kuwo.cn/api/www/music/musicInfo', {
      mid: id,
      httpsStatus: '1'
    }),
    type,
    200
  )
  const song = detail.data
  if (!song || (song.rid !== undefined && !sameId(song.rid, id))) throw metadataError(type)
  const response = checkCode(
    await json('https://www.kuwo.cn/api/v1/www/music/playUrl', {
      mid: id,
      type: 'convert_url',
      httpsStatus: '1'
    }),
    type,
    200
  )
  return {
    title: song.name,
    singer: song.artist,
    url: `https://www.kuwo.cn/play_detail/${id}`,
    audio: response.data?.url,
    image: song.pic
  }
}

// Migu legacy getSongInfo: songItem.songName/singer/img/mp3; missing mp3 is an error.
async function migu(id: string, { json }: ResolverContext): Promise<MusicInfo> {
  const type = 'migu'
  const response = await json('https://music.migu.cn/v3/api/music/audioPlayer/getSongInfo', {
    copyrightId: id
  })
  if (
    !response ||
    (response.returnCode !== undefined && String(response.returnCode) !== '000000')
  ) {
    throw musicError('ERR_MUSIC_RESPONSE', type, '官方 getSongInfo 接口返回失败')
  }
  const song = response.songItem
  if (!song || (song.copyrightId !== undefined && !sameId(song.copyrightId, id)))
    throw metadataError(type)
  return {
    title: song.songName,
    singer: song.singer,
    url: `https://music.migu.cn/v3/music/song/${id}`,
    audio: song.mp3,
    image: song.img
  }
}

const DEFAULT_RESOLVERS: Record<string, MusicResolver> = { qq, 163: netease, kugou, kuwo, migu }
const registeredResolvers = new Map<string, { resolver: MusicResolver }>()

export function registerMusicResolver(type: string, resolver: MusicResolver) {
  if (typeof type !== 'string' || !type.trim() || typeof resolver !== 'function') {
    throw new TypeError('音乐来源名称必须是非空字符串，resolver 必须是函数')
  }
  const registration = { resolver }
  registeredResolvers.set(type, registration)
  return () => {
    if (registeredResolvers.get(type) === registration) registeredResolvers.delete(type)
  }
}

/**
 * 返回 { title, singer, url, audio, image }，封面可为空。
 * 调用级 resolvers 优先于插件注册的解析器，其次使用内置来源。
 * 保留 ID 字符串，超时覆盖完整解析过程。
 */
export async function resolveMusicInfo(
  type: string,
  id: string | number,
  { fetchImpl = globalThis.fetch, timeoutMs = 8000, resolvers = {} }: ResolveOptions = {}
): Promise<MusicInfo> {
  if (typeof type !== 'string') throw musicError('ERR_MUSIC_PLATFORM', type, '不支持的音乐平台')
  if (
    typeof fetchImpl !== 'function' ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 2147483647 ||
    !resolvers ||
    typeof resolvers !== 'object' ||
    Array.isArray(resolvers)
  ) {
    throw musicError('ERR_MUSIC_OPTIONS', type, 'fetchImpl、timeoutMs 或 resolvers 配置无效')
  }
  const override = Object.hasOwn(resolvers, type)
  const registration = registeredResolvers.get(type)
  if (!PLATFORMS.has(type) && !override && !registration) {
    throw musicError('ERR_MUSIC_PLATFORM', type, '未注册该音乐来源')
  }
  const resolver = override ? resolvers[type] : (registration?.resolver ?? DEFAULT_RESOLVERS[type])
  if (typeof resolver !== 'function')
    throw musicError('ERR_MUSIC_OPTIONS', type, '平台 resolver 必须是函数')
  if (typeof id === 'number') {
    if (!Number.isSafeInteger(id) || id < 0)
      throw musicError('ERR_MUSIC_ID', type, '数字 ID 必须是非负安全整数')
    id = String(id)
  }
  const pattern =
    override || registration ? /\S/ : type === 'qq' || type === 'kugou' ? /^[a-z\d]+$/i : /^\d+$/
  if (typeof id !== 'string' || !pattern.test(id))
    throw musicError('ERR_MUSIC_ID', type, 'ID 格式无效')
  const controller = new AbortController()
  const timeoutError = musicError('ERR_MUSIC_TIMEOUT', type, `解析超时 (${timeoutMs}ms)`)
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort(timeoutError)
      reject(timeoutError)
    }, timeoutMs)
  })
  const boundedFetch: MusicFetch = async (input, options = {}) => {
    controller.signal.throwIfAborted()
    const url = httpUrl(input instanceof URL ? input.href : input, type, 'request URL')
    const headers = new Headers(options.headers)
    if (!headers.has('User-Agent'))
      headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
    if (!headers.has('Referer')) headers.set('Referer', new URL(url).origin + '/')
    let response
    try {
      response = await fetchImpl(url, {
        ...options,
        headers,
        signal: controller.signal,
        redirect: 'error'
      })
    } catch (cause) {
      if (controller.signal.aborted) throw controller.signal.reason
      throw musicError('ERR_MUSIC_NETWORK', type, '音乐平台网络请求失败', cause)
    }
    controller.signal.throwIfAborted()
    if (response.url) httpUrl(response.url, type, 'response URL')
    return response
  }
  const json: JsonFetcher = async (endpoint, params = {}, options = {}) => {
    const url = new URL(endpoint)
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
    const response = await boundedFetch(url, options)
    if (!response.ok) {
      const error = musicError(
        'ERR_MUSIC_HTTP',
        type,
        `音乐平台 HTTP 请求失败 (${response.status})`
      )
      error.status = response.status
      throw error
    }
    try {
      const data = await response.json()
      controller.signal.throwIfAborted()
      return data
    } catch (cause) {
      if (controller.signal.aborted) throw controller.signal.reason
      throw musicError('ERR_MUSIC_RESPONSE', type, '音乐平台响应不是有效 JSON', cause)
    }
  }
  try {
    const work = Promise.resolve()
      .then(() =>
        resolver(id, {
          type,
          fetchImpl: boundedFetch,
          signal: controller.signal,
          timeoutMs,
          json
        })
      )
      .then((info) => validateInfo(info, type))
    return await Promise.race([work, timeout])
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}
