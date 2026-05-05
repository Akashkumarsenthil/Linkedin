/**
 * API base: dev uses Vite proxy (/api -> backend). Production: set VITE_API_URL.
 */
// Always prefer /api — dev: Vite proxy → backend; prod: nginx proxy → backend.
// Override with VITE_API_URL for cloud deploys where the backend is on a
// different host than the frontend.
const base =
  import.meta.env.VITE_API_URL?.replace(/\/$/, '') || '/api'

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
export function parseStoredUser(): { user_id: number; user_type: 'member' | 'recruiter' | 'admin'; email: string } | null {
  const token = getStoredToken()
  if (!token) return null
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(b64))
    if (typeof payload.user_id !== 'number' || !payload.user_type) return null
    if (payload.exp && payload.exp < Date.now() / 1000) return null
    return { user_id: payload.user_id, user_type: payload.user_type as 'member' | 'recruiter' | 'admin', email: payload.sub ?? '' }
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

async function handleResponse<T>(res: Response): Promise<T> {
  const text = await res.text()
  if (!res.ok) {
    if (res.status === 502 || text.includes('502 Bad Gateway')) {
      throw new Error('Service temporarily unavailable (502 Bad Gateway). Please try again in a few moments.')
    }
    try {
      const parsed = JSON.parse(text)
      const detail = parsed.detail
      if (typeof detail === 'string') throw new Error(detail)
      if (Array.isArray(detail)) {
        // Handle FastAPI validation error list
        const msg = detail.map((d: any) => d.msg).join(', ')
        throw new Error(msg)
      }
      throw new Error(parsed.message || res.statusText)
    } catch (e) {
      // If the error was one we explicitly threw above, re-throw it.
      // But if it's a SyntaxError from JSON.parse, ignore it and fall back.
      if (e instanceof Error && e.name !== 'SyntaxError') throw e
      
      if (text.trim().startsWith('<')) {
        throw new Error(`HTTP Error ${res.status}: ${res.statusText}`)
      }
      throw new Error(text || res.statusText)
    }
  }
  return text ? (JSON.parse(text) as T) : ({} as T)
}

export async function apiGet<T>(path: string): Promise<T> {
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`
  const res = await fetch(url, { headers: authHeaders() })
  return handleResponse<T>(res)
}

export async function apiPost<T>(path: string, body: object): Promise<T> {
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  return handleResponse<T>(res)
}

export async function apiPostForm<T>(path: string, body: Record<string, string>): Promise<T> {
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  })
  return handleResponse<T>(res)
}

/** Multipart upload (e.g. resume). Do not set Content-Type — browser sets boundary. */
export async function apiUploadFile<T>(path: string, file: File, fieldName = 'file'): Promise<T> {
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`
  const fd = new FormData()
  fd.append(fieldName, file)
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(),
    body: fd,
  })
  return handleResponse<T>(res)
}
