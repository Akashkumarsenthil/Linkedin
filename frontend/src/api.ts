/**
 * API base: dev uses Vite proxy (/api -> backend). Production: set VITE_API_URL.
 */
const base =
  import.meta.env.VITE_API_URL?.replace(/\/$/, '') ||
  (import.meta.env.DEV ? '/api' : 'http://127.0.0.1:8000')

// ── Token storage ─────────────────────────────────────────────────────────────

const TOKEN_KEY = 'linkedin_auth_token'

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

// ── Auth headers ──────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const token = getStoredToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

export async function apiGet<T>(path: string): Promise<T> {
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`
  const res = await fetch(url, { headers: authHeaders() })
  const text = await res.text()
  if (!res.ok) throw new Error(text || res.statusText)
  return text ? (JSON.parse(text) as T) : ({} as T)
}

export async function apiPost<T>(path: string, body: object): Promise<T> {
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(text || res.statusText)
  return text ? (JSON.parse(text) as T) : ({} as T)
}

export async function apiPostForm<T>(path: string, body: Record<string, string>): Promise<T> {
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(text || res.statusText)
  return text ? (JSON.parse(text) as T) : ({} as T)
}
