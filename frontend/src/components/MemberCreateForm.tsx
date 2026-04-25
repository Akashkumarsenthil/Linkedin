import { useState } from 'react'
import { apiPost } from '../api'

interface CreateResponse {
  success: boolean
  message: string
  data?: Record<string, unknown>
}

export function MemberCreateForm() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [headline, setHeadline] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [skillsRaw, setSkillsRaw] = useState('')

  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<CreateResponse | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const clearForm = () => {
    setFirstName('')
    setLastName('')
    setEmail('')
    setHeadline('')
    setCity('')
    setState('')
    setSkillsRaw('')
  }

  const submit = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setErr('First name, last name, and email are required.')
      return
    }

    const skills = skillsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    setLoading(true)
    setErr(null)
    setResult(null)

    try {
      const r = await apiPost<CreateResponse>('/members/create', {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        headline: headline.trim() || undefined,
        location_city: city.trim() || undefined,
        location_state: state.trim() || undefined,
        skills: skills.length ? skills : undefined,
      })
      setResult(r)
      if (r.success) clearForm()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setLoading(false)
    }
  }

  const dirty = firstName || lastName || email

  return (
    <div className="create-form-section">
      <h3 className="create-form-title">Create member</h3>

      <div className="form-grid">
        <label className="form-label">
          First name *
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Jane"
          />
        </label>

        <label className="form-label">
          Last name *
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Smith"
          />
        </label>

        <label className="form-label form-full">
          Email *
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
          />
        </label>

        <label className="form-label form-full">
          Headline
          <input
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="ML Engineer at Acme"
          />
        </label>

        <label className="form-label">
          City
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="San Jose"
          />
        </label>

        <label className="form-label">
          State / Province
          <input
            value={state}
            onChange={(e) => setState(e.target.value)}
            placeholder="California"
          />
        </label>

        <label className="form-label form-full">
          Skills{' '}
          <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(comma-separated)</span>
          <input
            value={skillsRaw}
            onChange={(e) => setSkillsRaw(e.target.value)}
            placeholder="Python, Kafka, React"
          />
        </label>
      </div>

      <div className="create-form-actions">
        <button type="button" className="primary" onClick={submit} disabled={loading}>
          {loading ? 'Creating…' : 'Create member'}
        </button>
        {dirty && (
          <button
            type="button"
            className="ghost-btn"
            onClick={() => { clearForm(); setResult(null); setErr(null) }}
            disabled={loading}
          >
            Clear
          </button>
        )}
      </div>

      {err && <p className="error">{err}</p>}

      {result?.success && result.data && (
        <div className="create-success">
          <span className="result-ok">
            ✓ Created — member ID #{String(result.data.member_id)}
          </span>
          <span className="muted">
            {String(result.data.first_name)} {String(result.data.last_name)} ·{' '}
            {String(result.data.email)}
          </span>
        </div>
      )}

      {result && !result.success && (
        <p className="error">{result.message}</p>
      )}
    </div>
  )
}
