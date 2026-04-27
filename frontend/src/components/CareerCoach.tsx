import { useState } from 'react'

export function CareerCoach() {
  const [coachFile, setCoachFile]         = useState<File | null>(null)
  const [coachHeadline, setCoachHeadline] = useState('')
  const [coachJobTitle, setCoachJobTitle] = useState('')
  const [coachSkills, setCoachSkills]     = useState('')
  const [coachJobId, setCoachJobId]       = useState('')
  const [coachResult, setCoachResult]     = useState<Record<string, unknown> | null>(null)
  const [coachLoading, setCoachLoading]   = useState(false)
  const [coachErr, setCoachErr]           = useState<string | null>(null)

  const handleCareerCoach = async () => {
    if (!coachFile) { setCoachErr('Please select a PDF file first.'); return }
    setCoachLoading(true)
    setCoachErr(null)
    setCoachResult(null)
    try {
      const fd = new FormData()
      fd.append('file', coachFile)
      if (coachHeadline) fd.append('headline', coachHeadline)
      if (coachJobTitle) fd.append('job_title', coachJobTitle)
      if (coachSkills)   fd.append('required_skills', coachSkills)
      if (coachJobId)    fd.append('job_id', coachJobId)
      const res = await fetch('/api/ai/career-coach-pdf', { method: 'POST', body: fd })
      const r = await res.json()
      if (r.success) setCoachResult(r.data)
      else setCoachErr(r.message ?? 'Career coach failed')
    } catch (e) {
      setCoachErr(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setCoachLoading(false)
    }
  }

  return (
    <section className="panel">
      <h2 className="panel-heading">Career Coach</h2>
      <div className="ai-tool-section">
        <p className="hint">
          Upload your resume and see how well you match a target role — with actionable suggestions to improve your profile.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <label className="ai-field">
            Job ID <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional — loads job details)</span>
            <input type="number" value={coachJobId} onChange={(e) => setCoachJobId(e.target.value)} placeholder="e.g. 1" min={1} />
          </label>
          <label className="ai-field">
            Current headline
            <input type="text" value={coachHeadline} onChange={(e) => setCoachHeadline(e.target.value)} placeholder="e.g. Software Engineer at Acme" />
          </label>
        </div>

        <label className="ai-field" style={{ marginBottom: '0.5rem' }}>
          Resume PDF <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(PDF only, max 5 MB)</span>
          <input
            type="file"
            accept=".pdf"
            onChange={(e) => {
              setCoachFile(e.target.files?.[0] ?? null)
              setCoachResult(null)
              setCoachErr(null)
            }}
          />
        </label>
        {coachFile && (
          <p className="hint" style={{ marginBottom: '0.5rem' }}>Selected: {coachFile.name}</p>
        )}

        <label className="ai-field" style={{ marginBottom: '0.5rem' }}>
          Target job title
          <input type="text" value={coachJobTitle} onChange={(e) => setCoachJobTitle(e.target.value)} placeholder="e.g. Senior Backend Engineer" />
        </label>

        <label className="ai-field" style={{ marginBottom: '0.75rem' }}>
          Required skills <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(comma-separated)</span>
          <input type="text" value={coachSkills} onChange={(e) => setCoachSkills(e.target.value)} placeholder="Python, Kafka, Kubernetes" />
        </label>

        <button type="button" className="primary" onClick={handleCareerCoach} disabled={coachLoading || !coachFile}>
          {coachLoading ? 'Analyzing…' : 'Get coaching suggestions'}
        </button>

        {coachErr && <p className="error mt-sm">{coachErr}</p>}

        {coachResult && (
          <div className="coach-result">
            <div className="coach-score-row">
              <span className="coach-score-label">Profile match score</span>
              <span className="coach-score-value" style={{ color: Number(coachResult.overall_score) >= 0.6 ? 'var(--success)' : Number(coachResult.overall_score) >= 0.4 ? '#f59e0b' : 'var(--error)' }}>
                {Math.round(Number(coachResult.overall_score) * 100)}%
              </span>
            </div>
            {coachResult.score_rationale != null && <p className="coach-rationale">{String(coachResult.score_rationale)}</p>}

            <div className="coach-section">
              <h4>Suggested Headline</h4>
              <p className="coach-headline-suggestion">{String(coachResult.headline_suggestion ?? '')}</p>
            </div>

            <div className="coach-section">
              <h4>Suggested Summary</h4>
              <p>{String(coachResult.summary_suggestion ?? '')}</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="coach-section">
                <h4>Skills to Add</h4>
                <div className="coach-tags coach-tags-add">
                  {(coachResult.skills_to_add as string[] ?? []).map((s) => <span key={s} className="coach-tag">{s}</span>)}
                </div>
              </div>
              <div className="coach-section">
                <h4>Skills to Highlight</h4>
                <div className="coach-tags coach-tags-highlight">
                  {(coachResult.skills_to_highlight as string[] ?? []).map((s) => <span key={s} className="coach-tag">{s}</span>)}
                </div>
              </div>
            </div>

            <div className="coach-section">
              <h4>Experience Tips</h4>
              <ul className="coach-tips">
                {(coachResult.experience_tips as string[] ?? []).map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>

            {(coachResult.top_gaps as string[] ?? []).length > 0 && (
              <div className="coach-section">
                <h4>Top Gaps</h4>
                <div className="coach-tags coach-tags-gap">
                  {(coachResult.top_gaps as string[] ?? []).map((s) => <span key={s} className="coach-tag">{s}</span>)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
