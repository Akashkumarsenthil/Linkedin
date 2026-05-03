/**
 * AiDashboard — Recruiter AI workflow panel.
 *
 * Supports:
 *  - Starting a new candidate-analysis task (job_id + top_n)
 *  - Viewing all active tasks with status badges
 *  - Selecting a task to see live progress via WebSocket
 *  - Viewing shortlist candidates and outreach drafts
 *  - Approving / rejecting the AI output
 *  - Standalone resume parsing and job matching tools
 */

import React, { useState, useEffect, useCallback } from 'react'
import { apiPost, apiGet, parseStoredUser } from '../api'
import { useAiTaskWs } from '../hooks/useAiTaskWs'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TaskSummary {
  task_id: string
  job_id: number | null
  status: string
  created_at?: string
}

interface BreakdownDim {
  score: number
  matched?: string[]
  missing?: string[]
  reasoning?: string
  reason?: string
}

interface ShortlistEntry {
  candidate_id: number
  candidate_name?: string
  overall_score: number
  recommendation: string
  scoring_method?: string
  skills_score?: number
  location_score?: number
  seniority_score?: number
  breakdown?: {
    skills?: BreakdownDim
    location?: BreakdownDim
    seniority?: BreakdownDim
    title_relevance?: BreakdownDim
  }
}

interface OutreachDraft {
  candidate_id?: number
  candidate_name?: string
  subject: string
  body: string
  match_score: number
  recommendation: string
}

interface TaskResult {
  job: { job_id: number; title: string }
  shortlist: ShortlistEntry[]
  outreach_drafts: OutreachDraft[]
  total_candidates_analyzed: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STEP_LABELS: Record<string, string> = {
  fetch_data: 'Fetch data',
  parse_resumes: 'Parse resumes',
  match_candidates: 'Match candidates',
  generate_outreach: 'Generate outreach',
  complete: 'Complete',
  error: 'Error',
}

const STATUS_CLASS: Record<string, string> = {
  queued: 'status-pill queued',
  running: 'status-pill running',
  awaiting_approval: 'status-pill awaiting',
  approved: 'status-pill approved',
  rejected: 'status-pill rejected',
  failed: 'status-pill failed',
  completed: 'status-pill approved',
  interrupted: 'status-pill failed',
}

function statusLabel(s: string) {
  const map: Record<string, string> = {
    queued: 'Queued',
    running: 'Running…',
    awaiting_approval: 'Awaiting approval',
    approved: 'Approved',
    rejected: 'Rejected',
    failed: 'Failed',
    completed: 'Completed',
    interrupted: 'Interrupted',
  }
  return map[s] ?? s
}

function fmtScore(n: number) {
  return `${Math.round(n * 100)}%`
}

function fmtTime(iso?: string) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="ai-progress-track">
      <div className="ai-progress-fill" style={{ width: `${value}%` }} />
      <span className="ai-progress-label">{value}%</span>
    </div>
  )
}

function StepTimeline({ steps }: { steps: { step: string; status: string; timestamp: string }[] }) {
  if (!steps.length) return null
  // Each step fires update_task_status twice (start + completion). Keep the last
  // occurrence of each step name so every step only appears once in the UI.
  const seen = new Map<string, { step: string; status: string; timestamp: string }>()
  steps.forEach(s => seen.set(s.step, s))
  const deduped = Array.from(seen.values())
  return (
    <div className="li-timeline">
      {deduped.map((s, i) => {
        const isDone    = s.status === 'completed' || s.status === 'done'
        const isRunning = s.status === 'running'
        const isError   = s.status === 'error' || s.status === 'failed'
        const isLast    = i === deduped.length - 1
        return (
          <div key={i} className="li-timeline-row">
            <div className="li-timeline-spine">
              <div className={`li-timeline-node ${isDone ? 'done' : isRunning ? 'running' : isError ? 'error' : 'pending'}`}>
                {isDone ? '✓' : isError ? '✕' : isRunning ? <span className="li-node-pulse" /> : null}
              </div>
              {!isLast && <div className={`li-timeline-line ${isDone ? 'done' : ''}`} />}
            </div>
            <div className="li-timeline-body">
              <span className="li-step-name">{STEP_LABELS[s.step] ?? s.step}</span>
              <span className="li-step-time">{fmtTime(s.timestamp)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}


type PipelineDecision = 'interview' | 'selected' | 'rejected' | null

function ShortlistCard({ entry, jobId, onNavigateProfile }: { entry: ShortlistEntry; jobId?: number; onNavigateProfile?: (id: number) => void }) {
  const [expanded, setExpanded]   = useState(false)
  const [decision, setDecision]   = useState<PipelineDecision>(null)
  const [deciding, setDeciding]   = useState(false)

  const pct = Math.round(entry.overall_score * 100)
  const initials = (entry.candidate_name ?? `#${entry.candidate_id}`)
    .split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()
  const recShort   = pct >= 70 ? 'Strong Match' : pct >= 45 ? 'Good Match' : 'Weak Match'
  const isStrong   = pct >= 70
  const isGood     = pct >= 45 && pct < 70
  const recClass   = isStrong ? 'li-rec-strong' : isGood ? 'li-rec-good' : 'li-rec-weak'
  const scoreColor = isStrong ? 'var(--success)' : isGood ? '#915907' : 'var(--error)'

  // Resolve per-dimension scores from breakdown (LLM) or top-level fields (legacy)
  const bd = entry.breakdown
  const skillsScore    = bd?.skills?.score    ?? entry.skills_score
  const locationScore  = bd?.location?.score  ?? entry.location_score
  const seniorityScore = bd?.seniority?.score ?? entry.seniority_score
  const titleScore     = bd?.title_relevance?.score

  // Reasoning text lines — present for LLM-scored tasks
  const reasoningLines: { label: string; text: string }[] = []
  if (bd?.skills?.reasoning)
    reasoningLines.push({ label: 'Skills',    text: bd.skills.reasoning })
  if (bd?.location?.reasoning || bd?.location?.reason)
    reasoningLines.push({ label: 'Location',  text: (bd.location?.reasoning ?? bd.location?.reason)! })
  if (bd?.seniority?.reasoning || bd?.seniority?.reason)
    reasoningLines.push({ label: 'Seniority', text: (bd.seniority?.reasoning ?? bd.seniority?.reason)! })
  if (bd?.title_relevance?.reasoning || bd?.title_relevance?.reason)
    reasoningLines.push({ label: 'Role Fit',  text: (bd.title_relevance?.reasoning ?? bd.title_relevance?.reason)! })

  // Matched / missing skills from either LLM or rule-based breakdown
  const matchedSkills: string[] = bd?.skills?.matched ?? []
  const missingSkills: string[] = bd?.skills?.missing ?? []

  // Panel is always expandable — shows scores + skills even without LLM text
  const hasPanel = reasoningLines.length > 0 || matchedSkills.length > 0 || missingSkills.length > 0
    || skillsScore !== undefined || locationScore !== undefined || seniorityScore !== undefined

  const handleDecision = async (d: PipelineDecision) => {
    if (!d || deciding) return
    const next = decision === d ? null : d   // toggle off if already selected
    setDecision(next)
    if (!jobId || !next) return
    setDeciding(true)
    try {
      await apiPost('/ai/candidate-decision', { candidate_id: entry.candidate_id, job_id: jobId, decision: next })
    } catch { /* best-effort */ } finally {
      setDeciding(false)
    }
  }

  return (
    <div className="li-candidate-card">
      <div className="li-candidate-top">
        <div
          className="li-avatar"
          onClick={() => onNavigateProfile?.(entry.candidate_id)}
          style={{ cursor: onNavigateProfile ? 'pointer' : 'default' }}
        >
          {initials}
        </div>
        <div className="li-candidate-meta">
          <span
            className="li-candidate-name"
            onClick={() => onNavigateProfile?.(entry.candidate_id)}
            style={{
              cursor: onNavigateProfile ? 'pointer' : 'default',
              textDecoration: onNavigateProfile ? 'underline' : 'none',
              color: onNavigateProfile ? 'var(--li-blue-primary)' : 'inherit'
            }}
          >
            {entry.candidate_name ?? `Candidate #${entry.candidate_id}`}
          </span>
          <button
            className={`li-rec-badge ${recClass} li-rec-badge--clickable`}
            onClick={() => setExpanded(e => !e)}
            title={entry.recommendation}
          >
            {recShort}
            <span className="li-rec-chevron">{expanded ? '▲' : '▼'}</span>
          </button>
        </div>
        <div className="li-score-circle" style={{ color: scoreColor, borderColor: scoreColor }}>
          {pct}%
        </div>
      </div>

      {/* Score breakdown + reasoning dropdown */}
      {expanded && (
        <div className="li-reasoning-panel">
          {entry.scoring_method === 'openai_llm'
            ? <div className="li-reasoning-source">✦ AI-generated analysis</div>
            : <div className="li-reasoning-source">Score breakdown</div>
          }
          {entry.recommendation && (
            <div className="li-reasoning-summary">{entry.recommendation}</div>
          )}

          {/* Dimension scores */}
          {[
            { label: 'Overall',   score: entry.overall_score },
            { label: 'Skills',    score: skillsScore },
            { label: 'Location',  score: locationScore },
            { label: 'Seniority', score: seniorityScore },
            { label: 'Role Fit',  score: titleScore },
          ].filter(d => d.score !== undefined).map(({ label, score }) => (
            <div key={label} className="li-reasoning-row li-reasoning-score-row">
              <span className="li-reasoning-label">{label}</span>
              <div className="li-reasoning-score-bar-wrap">
                <div className="li-reasoning-score-bar-track">
                  <div
                    className="li-reasoning-score-bar-fill"
                    style={{
                      width: `${Math.round((score ?? 0) * 100)}%`,
                      background: (score ?? 0) >= 0.7 ? 'var(--success)' : (score ?? 0) >= 0.45 ? '#915907' : 'var(--error)'
                    }}
                  />
                </div>
                <span className="li-reasoning-score-pct">{Math.round((score ?? 0) * 100)}%</span>
              </div>
            </div>
          ))}

          {/* LLM reasoning text (only present for openai_llm scored tasks) */}
          {reasoningLines.map(({ label, text }) => (
            <div key={`r-${label}`} className="li-reasoning-row li-reasoning-text-row">
              <span className="li-reasoning-label">{label}</span>
              <span className="li-reasoning-text">{text}</span>
            </div>
          ))}

          {/* Matched / missing skills */}
          {matchedSkills.length > 0 && (
            <div className="li-reasoning-row">
              <span className="li-reasoning-label">Matched</span>
              <span className="li-reasoning-text li-reasoning-matched">{matchedSkills.join(', ')}</span>
            </div>
          )}
          {missingSkills.length > 0 && (
            <div className="li-reasoning-row li-reasoning-missing">
              <span className="li-reasoning-label">Missing</span>
              <span className="li-reasoning-text">{missingSkills.join(', ')}</span>
            </div>
          )}
        </div>
      )}

      <div className="li-score-bar-wrap">
        <div className="li-score-bar-track">
          <div className="li-score-bar-fill" style={{ width: `${pct}%`, background: scoreColor }} />
        </div>
        <span className="li-score-pct" style={{ color: scoreColor }}>{pct}%</span>
      </div>

      {(skillsScore !== undefined || locationScore !== undefined) && (
        <div className="li-sub-scores">
          {skillsScore !== undefined && (
            <div className="li-sub-score-item">
              <span className="li-sub-label">Skills</span>
              <div className="li-sub-bar-track">
                <div className="li-sub-bar-fill" style={{ width: `${Math.round(skillsScore * 100)}%` }} />
              </div>
              <span className="li-sub-pct">{fmtScore(skillsScore)}</span>
            </div>
          )}
          {locationScore !== undefined && (
            <div className="li-sub-score-item">
              <span className="li-sub-label">Location</span>
              <div className="li-sub-bar-track">
                <div className="li-sub-bar-fill" style={{ width: `${Math.round(locationScore * 100)}%` }} />
              </div>
              <span className="li-sub-pct">{fmtScore(locationScore)}</span>
            </div>
          )}
          {seniorityScore !== undefined && (
            <div className="li-sub-score-item">
              <span className="li-sub-label">Seniority</span>
              <div className="li-sub-bar-track">
                <div className="li-sub-bar-fill" style={{ width: `${Math.round(seniorityScore * 100)}%` }} />
              </div>
              <span className="li-sub-pct">{fmtScore(seniorityScore)}</span>
            </div>
          )}
          {titleScore !== undefined && (
            <div className="li-sub-score-item">
              <span className="li-sub-label">Role Fit</span>
              <div className="li-sub-bar-track">
                <div className="li-sub-bar-fill" style={{ width: `${Math.round(titleScore * 100)}%` }} />
              </div>
              <span className="li-sub-pct">{fmtScore(titleScore)}</span>
            </div>
          )}
        </div>
      )}

      {/* Pipeline action buttons */}
      <div className="li-pipeline-actions">
        <button
          className={`li-pipeline-btn interview${decision === 'interview' ? ' active' : ''}`}
          onClick={() => handleDecision('interview')}
          disabled={deciding}
          title="Move to interview stage"
        >
          {decision === 'interview' ? '✓ Interview' : 'Interview'}
        </button>
        <button
          className={`li-pipeline-btn selected${decision === 'selected' ? ' active' : ''}`}
          onClick={() => handleDecision('selected')}
          disabled={deciding}
          title="Mark as selected / offer"
        >
          {decision === 'selected' ? '✓ Selected' : 'Select'}
        </button>
        <button
          className={`li-pipeline-btn rejected${decision === 'rejected' ? ' active' : ''}`}
          onClick={() => handleDecision('rejected')}
          disabled={deciding}
          title="Reject this candidate"
        >
          {decision === 'rejected' ? '✕ Rejected' : 'Reject'}
        </button>
      </div>
    </div>
  )
}

function OutreachCard({ draft, index }: { draft: OutreachDraft; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [localBody, setLocalBody] = useState(draft.body)
  const initials = (draft.candidate_name ?? `C${index + 1}`)
    .split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(localBody).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleSend = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const identity = parseStoredUser()
    if (!identity || !draft.candidate_id) {
      alert("Missing user identity or candidate ID")
      return
    }
    setSending(true)
    try {
      const tr = await apiPost<{ success: boolean; data: { thread_id: number } }>(
        '/threads/open',
        {
          participant_ids: [
            { user_id: identity.user_id, user_type: identity.user_type },
            { user_id: draft.candidate_id, user_type: 'member' }
          ],
          subject: draft.subject || 'Opportunity'
        }
      )
      if (!tr.success || !tr.data?.thread_id) throw new Error('Failed to create thread')
      
      const mr = await apiPost<{ success: boolean }>(
        '/messages/send',
        {
          thread_id: tr.data.thread_id,
          sender_id: identity.user_id,
          sender_type: identity.user_type,
          message_text: localBody
        }
      )
      if (!mr.success) throw new Error('Failed to send message')
      setSent(true)
    } catch (err) {
      console.error(err)
      alert('Failed to send message')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="li-inmail-card">
      <div className="li-inmail-header" onClick={() => setExpanded((v) => !v)}>
        <div className="li-inmail-avatar">{initials}</div>
        <div className="li-inmail-info">
          <div className="li-inmail-top-row">
            <span className="li-inmail-to">{draft.candidate_name ?? `Candidate ${index + 1}`}</span>
            <span className="li-inmail-match">{fmtScore(draft.match_score)} match</span>
          </div>
          <div className="li-inmail-subject">{draft.subject}</div>
        </div>
        <div className="li-inmail-actions">
          {expanded && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                type="button" 
                className="li-copy-btn primary" 
                onClick={handleSend} 
                disabled={sending || sent || !draft.candidate_id}
                title="Send directly to candidate"
                style={{ padding: '4px 12px', fontSize: '13px', borderRadius: '4px' }}
              >
                {sent ? 'Sent ✓' : sending ? 'Sending...' : 'Send Message'}
              </button>
              <button type="button" className="li-copy-btn" onClick={handleCopy} title="Copy message">
                {copied ? '✓' : '⎘'}
              </button>
            </div>
          )}
          <span className="li-inmail-chevron">{expanded ? '▴' : '▾'}</span>
        </div>
      </div>
      {expanded && (
        <div className="li-inmail-body">
          <div className="li-inmail-divider" />
          <textarea 
            value={localBody}
            onChange={(e) => setLocalBody(e.target.value)}
            style={{ 
              width: '100%', 
              minHeight: '200px', 
              padding: '12px', 
              border: '1px solid #ccc', 
              borderRadius: '4px', 
              resize: 'vertical', 
              fontFamily: 'inherit', 
              fontSize: '14px',
              lineHeight: '1.5',
              boxSizing: 'border-box'
            }}
          />
        </div>
      )}
    </div>
  )
}

function ResumeView({ data }: { data: Record<string, unknown> }) {
  // The router wraps parsed fields inside data.data — unwrap if present
  const parsed = (data.data && typeof data.data === 'object' ? data.data : data) as Record<string, unknown>

  const name    = String(parsed.name ?? parsed.full_name ?? '')
  const email   = String(parsed.email ?? '')
  const phone   = String(parsed.phone ?? '')
  const summary = String(parsed.summary ?? parsed.objective ?? '')
  const yearsExp = parsed.years_of_experience != null ? `${parsed.years_of_experience} yrs exp` : ''
  const skills: string[]     = Array.isArray(parsed.skills) ? parsed.skills as string[] : []
  const experience: unknown[] = Array.isArray(parsed.experience) ? parsed.experience : []
  const education: unknown[]  = Array.isArray(parsed.education) ? parsed.education : []

  return (
    <div className="rp-card">
      {/* Identity */}
      <div className="rp-identity">
        <div className="rp-avatar">{name ? name.split(' ').slice(0,2).map((w: string) => w[0]).join('').toUpperCase() : '?'}</div>
        <div>
          {name && <p className="rp-name">{name}</p>}
          <div className="rp-contact-row">
            {email && <span className="rp-contact-item">✉ {email}</span>}
            {phone && <span className="rp-contact-item">📞 {phone}</span>}
            {yearsExp && <span className="rp-contact-item">🕐 {yearsExp}</span>}
          </div>
        </div>
      </div>

      {summary && (
        <div className="rp-section">
          <h4 className="rp-section-title">Summary</h4>
          <p className="rp-section-text">{summary}</p>
        </div>
      )}

      {skills.length > 0 && (
        <div className="rp-section">
          <h4 className="rp-section-title">Skills</h4>
          <div className="rp-tags">
            {skills.map((s) => <span key={s} className="rp-tag">{s}</span>)}
          </div>
        </div>
      )}

      {experience.length > 0 && (
        <div className="rp-section">
          <h4 className="rp-section-title">Experience</h4>
          <div className="rp-timeline">
            {experience.map((exp, i) => {
              const e = exp as Record<string, unknown>
              return (
                <div key={i} className="rp-timeline-item">
                  <div className="rp-timeline-dot" />
                  <div className="rp-timeline-content">
                    <span className="rp-job-title">{String(e.title ?? e.position ?? e.role ?? '')}</span>
                    {!!e.company && <span className="rp-company">{String(e.company)}</span>}
                    {!!(e.start_date || e.duration || e.dates) && (
                      <span className="rp-dates">{String(e.start_date ?? '')} {e.end_date ? `– ${String(e.end_date)}` : ''}{e.duration ? String(e.duration) : ''}{e.dates ? String(e.dates) : ''}</span>
                    )}
                    {!!e.description && <p className="rp-desc">{String(e.description)}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {education.length > 0 && (
        <div className="rp-section">
          <h4 className="rp-section-title">Education</h4>
          <div className="rp-timeline">
            {education.map((edu, i) => {
              const e = edu as Record<string, unknown>
              return (
                <div key={i} className="rp-timeline-item">
                  <div className="rp-timeline-dot" />
                  <div className="rp-timeline-content">
                    <span className="rp-job-title">{String(e.degree ?? e.qualification ?? '')}</span>
                    {!!(e.school ?? e.institution ?? e.field) && <span className="rp-company">{String(e.school ?? e.institution ?? e.field ?? '')}</span>}
                    {!!(e.year ?? e.graduation_year ?? e.dates) && (
                      <span className="rp-dates">{String(e.year ?? e.graduation_year ?? e.dates ?? '')}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function AiDashboard({ initialJobId, onNavigateProfile }: { initialJobId?: number | null; onNavigateProfile?: (id: number) => void } = {}) {
  // ── task list state ──────────────────────────────────────────────
  const [tasks, setTasks] = useState<TaskSummary[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)

  // ── new task form ────────────────────────────────────────────────
  const [jobId, setJobId] = useState(initialJobId ? String(initialJobId) : '')
  const [topN, setTopN] = useState('5')
  const [startLoading, setStartLoading] = useState(false)
  const [startErr, setStartErr] = useState<string | null>(null)

  useEffect(() => {
    if (initialJobId) setJobId(String(initialJobId))
  }, [initialJobId])

  // ── selected task ────────────────────────────────────────────────
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const { taskState: wsTaskState, wsStatus } = useAiTaskWs(selectedTaskId)
  const [restTaskState, setRestTaskState] = useState<Record<string, unknown> | null>(null)

  // Merge: WS data takes priority over REST snapshot
  const taskState = wsTaskState ?? (restTaskState as unknown as import('../hooks/useAiTaskWs').WsTaskState | null)

  // Fetch task via REST immediately when selected (covers already-completed tasks)
  useEffect(() => {
    if (!selectedTaskId) { setRestTaskState(null); return }
    apiGet<{ success: boolean; data: Record<string, unknown> }>(`/ai/task-status/${selectedTaskId}`)
      .then((r) => { if (r.success && r.data) setRestTaskState(r.data) })
      .catch(() => {})
  }, [selectedTaskId])

  // ── approval ─────────────────────────────────────────────────────
  const [feedback, setFeedback] = useState('')
  const [approvalLoading, setApprovalLoading] = useState(false)
  const [approvalMsg, setApprovalMsg] = useState<string | null>(null)

  // ── resume / match tools ─────────────────────────────────────────
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [resumeResult, setResumeResult] = useState<Record<string, unknown> | null>(null)
  const [resumeLoading, setResumeLoading] = useState(false)
  const [resumeErr, setResumeErr] = useState<string | null>(null)

  const [activeTool, setActiveTool] = useState<'dashboard' | 'resume'>('dashboard')

  // ── AI metrics ───────────────────────────────────────────────────
  const [metrics, setMetrics] = useState<{
    total_tasks: number
    human_in_the_loop: { total_reviewed: number; approval_rate: number | null; approval_rate_pct: string }
    match_quality: { candidates_scored: number; avg_match_score: number | null; avg_match_score_pct: string }
    status_breakdown: Record<string, number>
  } | null>(null)

  useEffect(() => {
    apiGet<{ success: boolean; data: unknown }>('/ai/metrics')
      .then((r) => { if (r.success && r.data) setMetrics(r.data as typeof metrics) })
      .catch(() => {})
  }, [])

  // ── load task list ───────────────────────────────────────────────
  const loadTasks = useCallback(async () => {
    setTasksLoading(true)
    try {
      const r = await apiPost<{ success: boolean; data: TaskSummary[] }>('/ai/tasks/list', {})
      if (r.success) setTasks(r.data ?? [])
    } catch {
      // best-effort
    } finally {
      setTasksLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  // When WS delivers a status update, refresh task list so sidebar badges update
  useEffect(() => {
    if (taskState?.status) {
      setTasks((prev) =>
        prev.map((t) =>
          t.task_id === selectedTaskId ? { ...t, status: taskState.status } : t,
        ),
      )
    }
  }, [taskState?.status, selectedTaskId])

  // ── start new task ───────────────────────────────────────────────
  const handleStart = async () => {
    if (!jobId.trim()) return
    setStartLoading(true)
    setStartErr(null)
    try {
      const r = await apiPost<{ success: boolean; message: string; data: { task_id: string; job_id: number } }>(
        '/ai/analyze-candidates',
        { job_id: Number(jobId), top_n: Number(topN) || 5 },
      )
      if (r.success && r.data?.task_id) {
        const newTask: TaskSummary = {
          task_id: r.data.task_id,
          job_id: r.data.job_id,
          status: 'queued',
          created_at: new Date().toISOString(),
        }
        setTasks((prev) => [newTask, ...prev])
        setSelectedTaskId(r.data.task_id)
        setJobId('')
        setApprovalMsg(null)
        setFeedback('')
      } else {
        setStartErr(r.message ?? 'Failed to start task')
      }
    } catch (e) {
      setStartErr(e instanceof Error ? e.message : 'Failed to start task')
    } finally {
      setStartLoading(false)
    }
  }

  // ── approval ─────────────────────────────────────────────────────
  const handleApproval = async (approved: boolean) => {
    if (!selectedTaskId) return
    setApprovalLoading(true)
    setApprovalMsg(null)
    try {
      const r = await apiPost<{ success: boolean; message: string }>(
        '/ai/approve',
        { task_id: selectedTaskId, approved, feedback },
      )
      setApprovalMsg(r.message)
      setFeedback('')
      // Refresh task list
      await loadTasks()
    } catch (e) {
      setApprovalMsg(e instanceof Error ? e.message : 'Approval failed')
    } finally {
      setApprovalLoading(false)
    }
  }

  // ── resume parsing ────────────────────────────────────────────────
  const handleParseResume = async () => {
    if (!resumeFile) { setResumeErr('Please select a PDF file first.'); return }
    setResumeLoading(true)
    setResumeErr(null)
    setResumeResult(null)
    try {
      const fd = new FormData()
      fd.append('file', resumeFile)
      const res = await fetch('/api/ai/parse-resume-pdf', { method: 'POST', body: fd })
      const r = await res.json()
      if (r.success) setResumeResult(r.data ?? r)
      else setResumeErr(r.message ?? 'Parsing failed')
    } catch (e) {
      setResumeErr(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setResumeLoading(false)
    }
  }

  // ── derived ───────────────────────────────────────────────────────
  const result = taskState?.result as TaskResult | undefined
  const isTerminal = taskState
    ? ['approved', 'rejected', 'failed', 'completed', 'interrupted'].includes(taskState.status)
    : false
  const canApprove = taskState?.status === 'awaiting_approval'

  // ── render ────────────────────────────────────────────────────────
  return (
    <section className="panel">
      <div className="ai-toolbar">
        <h2 className="panel-heading">AI Recruiter Dashboard</h2>
        <div className="ai-tool-tabs">
          <button
            type="button"
            className={activeTool === 'dashboard' ? 'tool-tab active' : 'tool-tab'}
            onClick={() => setActiveTool('dashboard')}
          >
            Hiring workflow
          </button>
          <button
            type="button"
            className={activeTool === 'resume' ? 'tool-tab active' : 'tool-tab'}
            onClick={() => setActiveTool('resume')}
          >
            Resume parser
          </button>
        </div>
      </div>

      {activeTool === 'resume' && (
        <div className="ai-tool-section">
          <p className="hint">
            Upload a candidate's PDF resume to extract structured data — name, skills, experience, and education — using OpenAI.
          </p>
          <label className="cc-upload-area" style={{ marginBottom: '0.75rem' }}>
            <input
              type="file"
              accept=".pdf"
              style={{ display: 'none' }}
              onChange={(e) => {
                setResumeFile(e.target.files?.[0] ?? null)
                setResumeResult(null)
                setResumeErr(null)
              }}
            />
            <span className="cc-upload-icon">📄</span>
            <span className="cc-upload-label">{resumeFile ? resumeFile.name : 'Click to upload resume PDF'}</span>
            <span className="cc-upload-hint">PDF only · max 5 MB</span>
          </label>
          <button type="button" className="primary" onClick={handleParseResume} disabled={resumeLoading || !resumeFile}>
            {resumeLoading ? 'Parsing…' : 'Parse resume'}
          </button>
          {resumeErr && <p className="error mt-sm">{resumeErr}</p>}
          {resumeResult && <ResumeView data={resumeResult} />}
        </div>
      )}

      {activeTool === 'dashboard' && metrics && (
        <div className="ai-metrics-bar">
          <div className="ai-metric-chip">
            <span className="ai-metric-label">Total workflows</span>
            <span className="ai-metric-value">{metrics.total_tasks}</span>
          </div>
          <div className="ai-metric-chip">
            <span className="ai-metric-label">Reviewed</span>
            <span className="ai-metric-value">{metrics.human_in_the_loop.total_reviewed}</span>
          </div>
          <div className="ai-metric-chip">
            <span className="ai-metric-label">Approval rate</span>
            <span className="ai-metric-value" style={{ color: 'var(--success)' }}>
              {metrics.human_in_the_loop.approval_rate_pct}
            </span>
          </div>
          <div className="ai-metric-chip">
            <span className="ai-metric-label">Candidates scored</span>
            <span className="ai-metric-value">{metrics.match_quality.candidates_scored}</span>
          </div>
          <div className="ai-metric-chip">
            <span className="ai-metric-label">Avg match score</span>
            <span className="ai-metric-value" style={{ color: 'var(--li-blue-primary)' }}>
              {metrics.match_quality.avg_match_score_pct}
            </span>
          </div>
        </div>
      )}

      {activeTool === 'dashboard' && (
        <div className="ai-dashboard-layout">
          {/* ── Sidebar ──────────────────────────────────────────── */}
          <div className="ai-sidebar">
            {/* New analysis form */}
            <div className="ai-new-task-card">
              <p className="ai-sidebar-section-title">New analysis</p>
              <div className="ai-form-row">
                <label className="ai-field">
                  Job ID
                  <input
                    type="number"
                    value={jobId}
                    onChange={(e) => setJobId(e.target.value)}
                    placeholder="e.g. 1"
                    min={1}
                  />
                </label>
                <label className="ai-field ai-field-sm">
                  Top N
                  <input
                    type="number"
                    value={topN}
                    onChange={(e) => setTopN(e.target.value)}
                    min={1}
                    max={50}
                  />
                </label>
              </div>
              {startErr && <p className="error" style={{ fontSize: '0.8rem', margin: '0.35rem 0 0' }}>{startErr}</p>}
              <button
                type="button"
                className="primary ai-start-btn"
                disabled={startLoading || !jobId.trim()}
                onClick={handleStart}
              >
                {startLoading ? 'Starting…' : 'Start analysis'}
              </button>
            </div>

            {/* Task list */}
            <div className="ai-task-list-header">
              <span className="ai-sidebar-section-title">Tasks</span>
              <button type="button" className="ghost-btn" onClick={loadTasks} disabled={tasksLoading}>
                {tasksLoading ? '…' : '↺'}
              </button>
            </div>
            {tasks.length === 0 && !tasksLoading && (
              <p className="ai-empty-tasks">No tasks yet. Start an analysis above.</p>
            )}
            <ul className="ai-task-list">
              {tasks.map((t) => (
                <li
                  key={t.task_id}
                  className={`ai-task-item${selectedTaskId === t.task_id ? ' selected' : ''}`}
                  onClick={() => {
                    setSelectedTaskId(t.task_id)
                    setApprovalMsg(null)
                    setFeedback('')
                  }}
                >
                  <div className="ai-task-item-row">
                    <span className="ai-task-job">Job #{t.job_id ?? '?'}</span>
                    <span className={STATUS_CLASS[t.status] ?? 'status-pill queued'}>{statusLabel(t.status)}</span>
                  </div>
                  <span className="ai-task-id">{t.task_id.slice(0, 8)}…</span>
                </li>
              ))}
            </ul>
          </div>

          {/* ── Main detail pane ─────────────────────────────────── */}
          <div className="ai-detail-pane">
            {!selectedTaskId && (
              <div className="ai-detail-empty">
                <div className="ai-empty-icon">AI</div>
                <p className="ai-empty-msg">Select a task or start a new analysis to see results here.</p>
              </div>
            )}

            {selectedTaskId && (
              <>
                {/* Header */}
                <div className="ai-detail-header">
                  <div className="ai-detail-title-row">
                    <h3 className="ai-detail-title">
                      {result?.job?.title ?? `Task ${selectedTaskId.slice(0, 8)}…`}
                    </h3>
                    {taskState && (
                      <span className={STATUS_CLASS[taskState.status] ?? 'status-pill queued'}>
                        {statusLabel(taskState.status)}
                      </span>
                    )}
                  </div>
                  {taskState && (
                    <div className="ai-detail-meta">
                      <span>Job #{taskState.job_id}</span>
                      {taskState.current_step && (
                        <span>Step: {STEP_LABELS[taskState.current_step] ?? taskState.current_step}</span>
                      )}
                      <span className={`ws-dot ${wsStatus}`} title={`WebSocket: ${wsStatus}`} />
                    </div>
                  )}
                </div>

                {/* Progress bar */}
                {taskState && !isTerminal && (
                  <ProgressBar value={taskState.progress ?? 0} />
                )}
                {taskState?.progress === 100 && isTerminal && (
                  <ProgressBar value={100} />
                )}

                {/* Step timeline */}
                {taskState?.steps && taskState.steps.length > 0 && (
                  <div className="ai-section">
                    <p className="ai-section-label">Steps</p>
                    <StepTimeline steps={taskState.steps} />
                  </div>
                )}

                {/* No WS data yet — loading */}
                {!taskState && wsStatus === 'connecting' && (
                  <p className="ai-loading-msg">Connecting to task stream…</p>
                )}

                {/* Shortlist results */}
                {result && result.shortlist?.length > 0 && (
                  <div className="ai-section">
                    <p className="ai-section-label">
                      Shortlist — {result.shortlist.length} candidates
                      {result.total_candidates_analyzed
                        ? ` from ${result.total_candidates_analyzed} analyzed`
                        : ''}
                    </p>
                    <div className="candidate-grid">
                      {result.shortlist.map((entry, i) => (
                        <ShortlistCard key={i} entry={entry} jobId={result.job?.job_id} onNavigateProfile={onNavigateProfile} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Outreach drafts */}
                {result && result.outreach_drafts?.length > 0 && (
                  <div className="ai-section">
                    <p className="ai-section-label">Outreach drafts ({result.outreach_drafts.length})</p>
                    <div className="outreach-list">
                      {result.outreach_drafts.map((d, i) => (
                        <OutreachCard key={i} draft={d} index={i} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Approval controls */}
                {(canApprove || approvalMsg) && (
                  <div className="ai-section">
                    <p className="ai-section-label">Recruiter decision</p>
                    {canApprove && (
                      <div className="approval-box">
                        <p className="approval-prompt">
                          Review the shortlist and outreach drafts above, then approve or reject.
                        </p>
                        <label className="ai-field">
                          Feedback (optional)
                          <textarea
                            className="approval-feedback"
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                            rows={2}
                            placeholder="Notes for the record…"
                          />
                        </label>
                        <div className="approval-buttons">
                          <button
                            type="button"
                            className="approve-btn"
                            disabled={approvalLoading}
                            onClick={() => handleApproval(true)}
                          >
                            {approvalLoading ? '…' : 'Approve'}
                          </button>
                          <button
                            type="button"
                            className="reject-btn"
                            disabled={approvalLoading}
                            onClick={() => handleApproval(false)}
                          >
                            {approvalLoading ? '…' : 'Reject'}
                          </button>
                        </div>
                      </div>
                    )}
                    {approvalMsg && (
                      <p className="approval-result">{approvalMsg}</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
