import { useEffect, useState } from 'react'
import { apiPost } from '../api'

interface ApplyResponse {
  success: boolean
  message: string
  data?: Record<string, unknown>
}

interface Props {
  /** Job ID pre-filled when user clicks Apply on a search result card. */
  prefilledJobId: number | null
  onClear: () => void
}

export function JobApplyForm({ prefilledJobId, onClear }: Props) {
  const [memberId, setMemberId] = useState('')
  const [jobId, setJobId] = useState('')
  const [coverLetter, setCoverLetter] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ApplyResponse | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // Sync when user clicks Apply on a card
  useEffect(() => {
    if (prefilledJobId !== null) {
      setJobId(String(prefilledJobId))
      setResult(null)
      setErr(null)
    }
  }, [prefilledJobId])

  const reset = () => {
    setJobId('')
    setCoverLetter('')
    setResult(null)
    setErr(null)
    onClear()
  }

  const submit = async () => {
    const mid = parseInt(memberId, 10)
    const jid = parseInt(jobId, 10)

    if (!memberId.trim() || isNaN(mid) || mid < 1) {
      setErr('Enter a valid member ID (positive integer).')
      return
    }
    if (!jobId.trim() || isNaN(jid) || jid < 1) {
      setErr('Enter a valid job ID (positive integer).')
      return
    }

    setLoading(true)
    setErr(null)
    setResult(null)

    try {
      const body: Record<string, unknown> = { member_id: mid, job_id: jid }
      if (coverLetter.trim()) body.cover_letter = coverLetter.trim()

      const r = await apiPost<ApplyResponse>('/applications/submit', body)
      setResult(r)
      if (r.success) {
        setJobId('')
        setCoverLetter('')
        onClear()
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Submit failed')
    } finally {
      setLoading(false)
    }
  }

  // Classify backend error messages for targeted display
  const isDuplicate = result && !result.success && result.message.includes('already applied')
  const isClosed = result && !result.success && result.message.includes('closed')

  return (
    <div className="create-form-section">
      <h3 className="create-form-title">Apply to a job</h3>
      <p className="hint">
        Click <strong>Apply</strong> on a search result to pre-fill the job ID, or enter
        IDs directly. Member IDs are shown in the Members tab search results.
      </p>

      <div className="form-grid">
        <label className="form-label">
          Member ID *
          <input
            type="number"
            min={1}
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
            placeholder="e.g. 1"
          />
        </label>

        <label className="form-label">
          Job ID *
          {prefilledJobId !== null && (
            <span style={{ fontWeight: 400, color: 'var(--accent)', fontSize: '0.75rem' }}>
              {' '}(pre-filled from card)
            </span>
          )}
          <input
            type="number"
            min={1}
            value={jobId}
            onChange={(e) => { setJobId(e.target.value); if (prefilledJobId !== null) onClear() }}
            placeholder="e.g. 7"
          />
        </label>

        <label className="form-label form-full">
          Cover letter{' '}
          <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span>
          <textarea
            className="resume-input"
            rows={4}
            value={coverLetter}
            onChange={(e) => setCoverLetter(e.target.value)}
            placeholder="Why you're a great fit for this role…"
            spellCheck={false}
            style={{ marginBottom: 0 }}
          />
        </label>
      </div>

      <div className="create-form-actions">
        <button type="button" className="primary" onClick={submit} disabled={loading}>
          {loading ? 'Submitting…' : 'Submit application'}
        </button>
        {(jobId || coverLetter) && (
          <button type="button" className="ghost-btn" onClick={reset} disabled={loading}>
            Clear
          </button>
        )}
      </div>

      {err && <p className="error">{err}</p>}

      {result?.success && result.data && (
        <div className="create-success">
          <span className="result-ok">
            ✓ Application submitted — ID #{String(result.data.application_id)}
          </span>
          <span className="muted">
            Member {String(result.data.member_id)} → Job {String(result.data.job_id)} ·
            status: {String(result.data.status)}
          </span>
        </div>
      )}

      {isDuplicate && (
        <div className="apply-error-card apply-error-duplicate">
          <strong>Already applied</strong>
          <span>{result!.message}</span>
        </div>
      )}

      {isClosed && (
        <div className="apply-error-card apply-error-closed">
          <strong>Job is closed</strong>
          <span>This posting is no longer accepting applications.</span>
        </div>
      )}

      {result && !result.success && !isDuplicate && !isClosed && (
        <p className="error">{result.message}</p>
      )}
    </div>
  )
}
