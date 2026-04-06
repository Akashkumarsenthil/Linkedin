import { useState } from 'react'
import { apiPost, apiPostForm, apiGet, setStoredToken, clearStoredToken, getStoredToken } from '../api'

interface TokenResponse {
  access_token: string
  token_type: string
  user_type: string
  user_id: number
  email: string
}

interface MeResponse {
  user_type: string
  user_id: number
  email: string
  profile: Record<string, unknown>
}

type Mode = 'login' | 'register-member' | 'register-recruiter'

export function AuthPanel() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [headline, setHeadline] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [companyIndustry, setCompanyIndustry] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<MeResponse | null>(null)
  const [tokenInfo, setTokenInfo] = useState<{ user_type: string; user_id: number; email: string } | null>(
    () => {
      // Restore display info from token on mount (best-effort)
      const t = getStoredToken()
      return t ? null : null
    }
  )

  const clearForm = () => {
    setEmail('')
    setPassword('')
    setFirstName('')
    setLastName('')
    setHeadline('')
    setCompanyName('')
    setCompanyIndustry('')
    setError(null)
  }

  const handleLogin = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiPost<TokenResponse>('/auth/login', { email, password })
      setStoredToken(res.access_token)
      setTokenInfo({ user_type: res.user_type, user_id: res.user_id, email: res.email })
      setCurrentUser(null)
      clearForm()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleRegisterMember = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiPost<TokenResponse>('/auth/register/member', {
        email,
        password,
        first_name: firstName,
        last_name: lastName,
        headline: headline || undefined,
      })
      setStoredToken(res.access_token)
      setTokenInfo({ user_type: res.user_type, user_id: res.user_id, email: res.email })
      setCurrentUser(null)
      clearForm()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const handleRegisterRecruiter = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiPost<TokenResponse>('/auth/register/recruiter', {
        email,
        password,
        first_name: firstName,
        last_name: lastName,
        company_name: companyName || undefined,
        company_industry: companyIndustry || undefined,
      })
      setStoredToken(res.access_token)
      setTokenInfo({ user_type: res.user_type, user_id: res.user_id, email: res.email })
      setCurrentUser(null)
      clearForm()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const handleWhoAmI = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiGet<MeResponse>('/auth/me')
      setCurrentUser(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    clearStoredToken()
    setTokenInfo(null)
    setCurrentUser(null)
    setError(null)
  }

  const isLoggedIn = !!getStoredToken()

  return (
    <section className="panel">
      <h2>Authentication</h2>
      <p className="hint">
        Register or log in to obtain a JWT bearer token. Protected endpoints (apply, connect, send
        message, create/close job, update/delete profile) require a valid token.
      </p>

      {isLoggedIn && tokenInfo && (
        <div className="auth-status-card">
          <div className="auth-status-row">
            <span className="auth-badge">{tokenInfo.user_type}</span>
            <span className="auth-email">{tokenInfo.email}</span>
            <span className="auth-id">ID {tokenInfo.user_id}</span>
          </div>
          <div className="auth-actions-row">
            <button type="button" className="primary" onClick={handleWhoAmI} disabled={loading}>
              {loading ? 'Loading…' : 'GET /auth/me'}
            </button>
            <button type="button" className="auth-logout-btn" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </div>
      )}

      {isLoggedIn && !tokenInfo && (
        <div className="auth-status-card">
          <p className="auth-active-msg">Token active — use GET /auth/me to inspect.</p>
          <div className="auth-actions-row">
            <button type="button" className="primary" onClick={handleWhoAmI} disabled={loading}>
              {loading ? 'Loading…' : 'GET /auth/me'}
            </button>
            <button type="button" className="auth-logout-btn" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </div>
      )}

      {!isLoggedIn && (
        <>
          <div className="auth-mode-tabs">
            <button
              type="button"
              className={mode === 'login' ? 'auth-tab active' : 'auth-tab'}
              onClick={() => { setMode('login'); clearForm() }}
            >
              Login
            </button>
            <button
              type="button"
              className={mode === 'register-member' ? 'auth-tab active' : 'auth-tab'}
              onClick={() => { setMode('register-member'); clearForm() }}
            >
              Register (Member)
            </button>
            <button
              type="button"
              className={mode === 'register-recruiter' ? 'auth-tab active' : 'auth-tab'}
              onClick={() => { setMode('register-recruiter'); clearForm() }}
            >
              Register (Recruiter)
            </button>
          </div>

          <div className="auth-form">
            {(mode === 'register-member' || mode === 'register-recruiter') && (
              <div className="form-grid">
                <label>
                  First name *
                  <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" />
                </label>
                <label>
                  Last name *
                  <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Smith" />
                </label>
              </div>
            )}

            {mode === 'register-member' && (
              <label className="form-full">
                Headline
                <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="ML Engineer" />
              </label>
            )}

            {mode === 'register-recruiter' && (
              <div className="form-grid">
                <label>
                  Company name
                  <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Corp" />
                </label>
                <label>
                  Industry
                  <input value={companyIndustry} onChange={(e) => setCompanyIndustry(e.target.value)} placeholder="Technology" />
                </label>
              </div>
            )}

            <label>
              Email *
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com"
              />
            </label>
            <label>
              Password * (min 6 chars)
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
              />
            </label>

            <div className="create-form-actions">
              <button
                type="button"
                className="primary"
                disabled={loading || !email || !password}
                onClick={
                  mode === 'login'
                    ? handleLogin
                    : mode === 'register-member'
                    ? handleRegisterMember
                    : handleRegisterRecruiter
                }
              >
                {loading
                  ? 'Working…'
                  : mode === 'login'
                  ? 'Login'
                  : 'Register'}
              </button>
            </div>
          </div>
        </>
      )}

      {error && <p className="error" style={{ marginTop: '0.75rem' }}>{error}</p>}

      {currentUser && (
        <div className="auth-me-card">
          <p className="auth-me-title">Current user</p>
          <pre className="json-out">{JSON.stringify(currentUser, null, 2)}</pre>
        </div>
      )}
    </section>
  )
}
