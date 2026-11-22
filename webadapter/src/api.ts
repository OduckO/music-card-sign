const query = new URLSearchParams(location.search)
const guobaBase = query.get('__apiBase')
const webBase = query.get('__webBase')
const apiBase = guobaBase ?? (webBase !== null ? `${webBase}/api/music-card-sign` : '')

export const request = async (
  path: string,
  body?: unknown,
  signal?: AbortSignal
): Promise<Response> => {
  if (!apiBase) throw new Error('请从锅巴 next 或 QQBot-Web-Adapter 打开此页面')
  const url = new URL(`${apiBase.replace(/\/$/, '')}${path}`, location.origin)
  if (url.origin !== location.origin) throw new Error('面板接口必须与当前页面同源')
  const token = guobaBase ? query.get('token') : null
  return fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    redirect: 'error',
    cache: path === '/config' ? 'no-store' : 'default',
    signal,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { 'guoba-access-token': token } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
}

export const api = async <T>(path: string, body?: unknown, timeoutMs = 15000): Promise<T> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await request(path, body, controller.signal)
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
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error(`请求超时（${timeoutMs / 1000} 秒），已停止等待，请检查服务日志后重试。`, {
        cause: error
      })
    throw error
  } finally {
    clearTimeout(timer)
  }
}
