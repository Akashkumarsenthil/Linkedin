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

// Decode JWT payload from localStorage without a network call.
// Returns null if absent, malformed, or expired.
export function parseStoredUser(): { user_id: number; user_type: 'member' | 'recruiter'; email: string } | null {
  const token = getStoredToken()
  if (!token) return null
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(b64))
    if (typeof payload.user_id !== 'number' || !payload.user_type) return null
    if (payload.exp && payload.exp < Date.now() / 1000) return null
    return { user_id: payload.user_id, user_type: payload.user_type as 'member' | 'recruiter', email: payload.sub ?? '' }
  } catch {
    return null
  }
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
