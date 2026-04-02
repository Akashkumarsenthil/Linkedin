/**
 * API base: dev uses Vite proxy (/api -> backend). Production: set VITE_API_URL.
 */
const base =
  import.meta.env.VITE_API_URL?.replace(/\/$/, '') ||
  (import.meta.env.DEV ? '/api' : 'http://127.0.0.1:8000')

export async function apiGet<T>(path: string): Promise<T> {
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`
  const res = await fetch(url)
  const text = await res.text()
  if (!res.ok) throw new Error(text || res.statusText)
  return text ? (JSON.parse(text) as T) : ({} as T)
}

export async function apiPost<T>(path: string, body: object): Promise<T> {
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(text || res.statusText)
  return text ? (JSON.parse(text) as T) : ({} as T)
}
