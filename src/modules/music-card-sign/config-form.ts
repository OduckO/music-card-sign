import type { MusicRequest, PlatformInput } from '../../types'

export interface PlatformRow extends PlatformInput {
  name: string
  originalName?: string
}

export const platformRows = (platforms: Record<string, PlatformInput>): PlatformRow[] =>
  Object.entries(platforms).map(([name, platform]) =>
    Object.assign({}, platform, {
      name,
      originalName: name,
      appsign: platform.appsign ?? platform.app_sign ?? ''
    })
  )

export const platformsFromRows = (
  rows: PlatformRow[],
  previous: Record<string, PlatformInput> = {}
): Record<string, Partial<PlatformInput>> =>
  Object.fromEntries(
    rows
      .filter(({ name }) => name.trim())
      .map(({ name, originalName, appid, appname, appsign, ...extra }) => {
        const value: Partial<PlatformInput> = { ...previous[originalName ?? name], ...extra }
        delete value.appid
        delete value.appname
        delete value.appsign
        delete value.app_sign
        return [
          name.trim().toLowerCase(),
          {
            ...value,
            ...(String(appid ?? '').trim() ? { appid: Number(appid) } : {}),
            ...(appname?.trim() ? { appname: appname.trim() } : {}),
            ...(appsign?.trim() ? { appsign: appsign.trim() } : {})
          }
        ]
      })
  )

export const platformRowErrors = (row: PlatformRow, rows: PlatformRow[]) => ({
  name: !row.name.trim()
    ? '请填写平台名称'
    : rows.filter((item) => item.name.trim().toLowerCase() === row.name.trim().toLowerCase())
          .length > 1
      ? '平台名称不能重复'
      : '',
  appid:
    !String(row.appid ?? '').trim() ||
    !Number.isSafeInteger(Number(row.appid)) ||
    Number(row.appid) <= 0
      ? '请填写正整数 appid'
      : ''
})

export interface MusicForm {
  mode: 'custom' | 'id'
  type: string
  id: string
  title: string
  singer: string
  url: string
  audio: string
  image: string
  platform: string
}

export const musicForm = (request: MusicRequest): MusicForm => ({
  mode:
    request.id !== undefined && !(request.title ?? request.song ?? request.name) ? 'id' : 'custom',
  type: request.type === 'custom' ? '' : request.type || 'qq',
  id: String(request.id ?? ''),
  title: String(request.title ?? request.song ?? request.name ?? ''),
  singer: String(request.singer ?? request.artist ?? request.content ?? request.desc ?? ''),
  url: request.jump ?? request.jumpUrl ?? request.url ?? request.link ?? '',
  audio: request.audio ?? request.voice ?? request.musicUrl ?? '',
  image: request.image ?? request.cover ?? request.pic ?? '',
  platform:
    typeof (request._platform ?? request.platform) === 'object'
      ? '__inline__'
      : String(request._platform ?? request.platform ?? request.source ?? '')
})

export const musicFromForm = (form: MusicForm, previous: MusicRequest = {}): MusicRequest => {
  const result = { ...previous }
  for (const key of [
    'type',
    'source',
    'id',
    'title',
    'song',
    'name',
    'singer',
    'artist',
    'content',
    'desc',
    'url',
    'jump',
    'jumpUrl',
    'link',
    'audio',
    'voice',
    'musicUrl',
    'image',
    'cover',
    'pic',
    '_platform',
    'platform'
  ])
    delete result[key]
  const fields =
    form.mode === 'id'
      ? { type: form.type.trim(), id: form.id.trim() }
      : {
          type: 'custom',
          title: form.title,
          singer: form.singer,
          url: form.url.trim(),
          audio: form.audio.trim(),
          image: form.image.trim()
        }
  Object.assign(
    result,
    Object.fromEntries(Object.entries(fields).filter(([, value]) => value.trim()))
  )
  if (form.platform === '__inline__') result._platform = previous._platform ?? previous.platform
  else if (form.platform.trim()) result._platform = form.platform.trim().toLowerCase()
  return result
}

export const musicFormErrors = (form: MusicForm): Partial<Record<keyof MusicForm, string>> => {
  if (form.mode === 'id') {
    return {
      type: !form.type.trim() || form.type.trim() === 'custom' ? '请填写 ID 查询来源' : '',
      id: form.id.trim() ? '' : '请填写歌曲 ID'
    }
  }
  const errors: Partial<Record<keyof MusicForm, string>> = {
    title: form.title.trim() ? '' : '请填写歌曲名称',
    url: form.url.trim() ? '' : '请填写跳转链接'
  }
  for (const key of ['url', 'audio', 'image'] as const) {
    if (!form[key].trim()) continue
    if (!URL.canParse(form[key]) || !['http:', 'https:'].includes(new URL(form[key]).protocol))
      errors[key] = '请填写以 http:// 或 https:// 开头的链接'
  }
  return errors
}
