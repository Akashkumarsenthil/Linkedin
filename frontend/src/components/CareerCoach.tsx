import { useState } from 'react'

interface CoachResult {
  overall_score: number
  score_rationale?: string
  headline_suggestion?: string
  summary_suggestion?: string
  skills_to_add?: string[]
  skills_to_highlight?: string[]
  experience_tips?: string[]
  top_gaps?: string[]
}

function ScoreRing({ pct }: { pct: number }) {
  const r = 44
  const circ = 2 * Math.PI * r
  const fill = circ * (1 - pct / 100)
  const color = pct >= 70 ? '#057642' : pct >= 45 ? '#915907' : '#cc1016'
  return (
    <svg width={110} height={110} viewBox="0 0 110 110">
      <circle cx={55} cy={55} r={r} fill="none" stroke="rgba(0,0,0,.08)" strokeWidth={10} />
      <circle
        cx={55} cy={55} r={r} fill="none"
        stroke={color} strokeWidth={10}
        strokeDasharray={circ}
        strokeDashoffset={fill}
        strokeLinecap="round"
        transform="rotate(-90 55 55)"
        style={{ transition: 'stroke-dashoffset .6s ease' }}
      />
      <text x={55} y={52} textAnchor="middle" dominantBaseline="middle" fontSize={22} fontWeight={700} fill={color}>{pct}%</text>
      <text x={55} y={70} textAnchor="middle" fontSize={10} fill="rgba(0,0,0,.45)">match</text>
    </svg>
  )
}

export function CareerCoach() {
  const [coachFile, setCoachFile]         = useState<File | null>(null)
  const [coachHeadline, setCoachHeadline] = useState('')
  const [coachJobTitle, setCoachJobTitle] = useState('')
  const [coachSkills, setCoachSkills]     = useState('')
  const [coachJobId, setCoachJobId]       = useState('')
  const [coachResult, setCoachResult]     = useState<CoachResult | null>(null)
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

  const pct = coachResult ? Math.round(coachResult.overall_score * 100) : 0

  return (
    <section className="career-coach page-fade premium-panel">
      <header className="premium-header">
        <div>
          <h2 className="premium-title">Career Coach</h2>
          <p className="premium-subtitle">Optimize your professional profile with AI-powered resume analysis</p>
        </div>
      </header>

      <div style={{ padding: '24px' }}>

      <div className="cc-form-card">
        <p className="cc-form-desc">
          Upload your resume and see how well you match a target role — with actionable suggestions to improve your profile.
        </p>

        <div className="cc-form-grid">
          <label className="ai-field">
            Job ID <span className="ai-field-hint">(optional — loads job details)</span>
            <input type="number" value={coachJobId} onChange={(e) => setCoachJobId(e.target.value)} placeholder="e.g. 1" min={1} />
          </label>
          <label className="ai-field">
            Current headline
            <input type="text" value={coachHeadline} onChange={(e) => setCoachHeadline(e.target.value)} placeholder="e.g. Software Engineer at Acme" />
          </label>
          <label className="ai-field">
            Target job title
            <input type="text" value={coachJobTitle} onChange={(e) => setCoachJobTitle(e.target.value)} placeholder="e.g. Senior Backend Engineer" />
          </label>
          <label className="ai-field">
            Required skills <span className="ai-field-hint">(comma-separated)</span>
            <input type="text" value={coachSkills} onChange={(e) => setCoachSkills(e.target.value)} placeholder="Python, Kafka, Kubernetes" />
          </label>
        </div>

        <div className="cc-upload-row">
          <label className="cc-upload-area">
            <input
              type="file"
              accept=".pdf"
              style={{ display: 'none' }}
              onChange={(e) => {
                setCoachFile(e.target.files?.[0] ?? null)
                setCoachResult(null)
                setCoachErr(null)
              }}
            />
            <span className="cc-upload-icon">📄</span>
            <span className="cc-upload-label">
              {coachFile ? coachFile.name : 'Click to upload resume PDF'}
            </span>
            <span className="cc-upload-hint">PDF only · max 5 MB</span>
          </label>
        </div>

        <button type="button" className="cc-analyze-btn" onClick={handleCareerCoach} disabled={coachLoading || !coachFile}>
          {coachLoading ? (
            <><span className="cc-spinner" />Analyzing your resume…</>
          ) : 'Analyze my profile'}
        </button>

        {coachErr && <p className="cc-error">{coachErr}</p>}
      </div>

      {coachResult && (
        <div className="cc-results">
          {/* Score hero */}
          <div className="cc-score-hero">
            <ScoreRing pct={pct} />
            <div className="cc-score-text">
              <h3 className="cc-score-title">Profile match score</h3>
              {coachResult.score_rationale && (
                <p className="cc-score-rationale">{coachResult.score_rationale}</p>
              )}
            </div>
          </div>

          {/* Suggested headline */}
          {coachResult.headline_suggestion && (
            <div className="cc-result-card">
              <div className="cc-card-header">
                <span className="cc-card-icon">✏️</span>
                <h4 className="cc-card-title">Suggested Headline</h4>
              </div>
              <p className="cc-headline-preview">"{coachResult.headline_suggestion}"</p>
            </div>
          )}

          {/* Suggested summary */}
          {coachResult.summary_suggestion && (
            <div className="cc-result-card">
              <div className="cc-card-header">
                <span className="cc-card-icon">📝</span>
                <h4 className="cc-card-title">Suggested Summary</h4>
              </div>
              <p className="cc-card-body">{coachResult.summary_suggestion}</p>
            </div>
          )}

          {/* Skills grid */}
          <div className="cc-skills-row">
            {(coachResult.skills_to_add?.length ?? 0) > 0 && (
              <div className="cc-result-card cc-result-card--half">
                <div className="cc-card-header">
                  <span className="cc-card-icon">➕</span>
                  <h4 className="cc-card-title">Skills to Add</h4>
                </div>
                <div className="cc-tags">
                  {coachResult.skills_to_add!.map((s) => (
                    <span key={s} className="cc-tag cc-tag--add">{s}</span>
                  ))}
                </div>
              </div>
            )}
            {(coachResult.skills_to_highlight?.length ?? 0) > 0 && (
              <div className="cc-result-card cc-result-card--half">
                <div className="cc-card-header">
                  <span className="cc-card-icon">⭐</span>
                  <h4 className="cc-card-title">Skills to Highlight</h4>
                </div>
                <div className="cc-tags">
                  {coachResult.skills_to_highlight!.map((s) => (
                    <span key={s} className="cc-tag cc-tag--highlight">{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Experience tips */}
          {(coachResult.experience_tips?.length ?? 0) > 0 && (
            <div className="cc-result-card">
              <div className="cc-card-header">
                <span className="cc-card-icon">💡</span>
                <h4 className="cc-card-title">Experience Tips</h4>
              </div>
              <ul className="cc-tips-list">
                {coachResult.experience_tips!.map((tip, i) => (
                  <li key={i} className="cc-tips-item">
                    <span className="cc-tip-dot" />
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Top gaps */}
          {(coachResult.top_gaps?.length ?? 0) > 0 && (
            <div className="cc-result-card">
              <div className="cc-card-header">
                <span className="cc-card-icon">🎯</span>
                <h4 className="cc-card-title">Top Gaps to Address</h4>
              </div>
              <div className="cc-tags">
                {coachResult.top_gaps!.map((s) => (
                  <span key={s} className="cc-tag cc-tag--gap">{s}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      </div>
    </section>
  )
}
