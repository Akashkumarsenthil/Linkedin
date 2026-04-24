import { useState } from 'react'
import { apiPost, setStoredToken, getStoredToken } from '../api'

interface TokenResponse {
  access_token: string
  token_type: string
  user_type: string
  user_id: number
  email: string
}

type Mode = 'login' | 'register-member' | 'register-recruiter'

interface AuthPanelProps {
  onAuthChange?: () => void
}

/**
 * Guest-only sign in / registration UI.  Once signed in, the app routes
 * authenticated users to the Profile page (/tab=profile) instead of this
 * panel.
 */
export function AuthPanel({ onAuthChange }: AuthPanelProps) {
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
      clearForm()
      onAuthChange?.()
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
      clearForm()
      onAuthChange?.()
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
      clearForm()
      onAuthChange?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const isLoggedIn = !!getStoredToken()

  // Authenticated users shouldn't see this tab — App.tsx normally routes them
  // to /profile.  If they land here anyway, show a small hint.
  if (isLoggedIn) {
    return (
      <section className="panel">
        <div className="auth-card">
          <div>
            <p className="auth-card-title">You're signed in</p>
            <p className="auth-card-sub">
              Open your profile from the avatar in the top right to edit your details.
            </p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="panel">
      <div className="auth-panel-wrap">
        <div className="auth-card">
          <div>
            <p className="auth-card-title">Sign in to LinkedIn Agentic AI</p>
            <p className="auth-card-sub">
              Access job search, applications, messaging, and AI recruiter tools.
            </p>
          </div>

          <div className="auth-mode-tabs">
            <button
              type="button"
              className={mode === 'login' ? 'auth-tab active' : 'auth-tab'}
              onClick={() => { setMode('login'); clearForm() }}
            >
              Sign in
            </button>
            <button
              type="button"
              className={mode === 'register-member' ? 'auth-tab active' : 'auth-tab'}
              onClick={() => { setMode('register-member'); clearForm() }}
            >
              Join as Member
            </button>
            <button
              type="button"
              className={mode === 'register-recruiter' ? 'auth-tab active' : 'auth-tab'}
              onClick={() => { setMode('register-recruiter'); clearForm() }}
            >
              Join as Recruiter
            </button>
          </div>

          <div className="auth-form">
            {(mode === 'register-member' || mode === 'register-recruiter') && (
              <div className="form-grid">
                <label className="form-label">
                  First name *
                  <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jane" />
                </label>
                <label className="form-label">
                  Last name *
                  <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Smith" />
                </label>
              </div>
            )}

            {mode === 'register-member' && (
              <label className="form-label form-full">
                Headline
                <input value={headline} onChange={e => setHeadline(e.target.value)} placeholder="ML Engineer at Acme" />
              </label>
            )}

            {mode === 'register-recruiter' && (
              <div className="form-grid">
                <label className="form-label">
                  Company
                  <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Acme Corp" />
                </label>
                <label className="form-label">
                  Industry
                  <input value={companyIndustry} onChange={e => setCompanyIndustry(e.target.value)} placeholder="Technology" />
                </label>
              </div>
            )}

            <label className="form-label">
              Email *
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" />
            </label>
            <label className="form-label">
              Password * <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 12 }}>(min 6 chars)</span>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••" />
            </label>

            <button
              type="button"
              className="primary"
              style={{ alignSelf: 'stretch' }}
              disabled={loading || !email || !password}
              onClick={
                mode === 'login'
                  ? handleLogin
                  : mode === 'register-member'
                  ? handleRegisterMember
                  : handleRegisterRecruiter
              }
            >
              {loading ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </div>

          {error && <p className="error">{error}</p>}
        </div>
      </div>
    </section>
  )
}
