const query = new URLSearchParams(location.search)
const guobaBase = query.get('__apiBase')
const webBase = query.get('__webBase')
const apiBase = guobaBase ?? (webBase !== null ? `${webBase}/api/music-card-sign` : '')

export const api = async <T>(path: string, body?: unknown): Promise<T> => {
  if (!apiBase) throw new Error('请从锅巴 next 或 QQBot-Web-Adapter 打开此页面')
  const url = new URL(`${apiBase.replace(/\/$/, '')}${path}`, location.origin)
  if (url.origin !== location.origin) throw new Error('面板接口必须与当前页面同源')
  const token = guobaBase ? query.get('token') : null
  const response = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    redirect: 'error',
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { 'guoba-access-token': token } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
  const text = await response.text()
  let data: { ok?: boolean; error?: string; result: T }
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`服务器返回了非 JSON 内容（HTTP ${response.status}），请检查面板登录状态`)
  }
  if (!response.ok || data?.ok !== true)
    throw new Error(data?.error || `请求失败（HTTP ${response.status}）`)
  return data.result
}
