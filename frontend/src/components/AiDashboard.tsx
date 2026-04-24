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

import { useState, useEffect, useCallback } from 'react'
import { apiPost } from '../api'
import { useAiTaskWs } from '../hooks/useAiTaskWs'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TaskSummary {
  task_id: string
  job_id: number | null
  status: string
  created_at?: string
}

interface ShortlistEntry {
  candidate_id: number
  candidate_name?: string
  overall_score: number
  recommendation: string
  skills_score?: number
  location_score?: number
  seniority_score?: number
}

interface OutreachDraft {
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
  return (
    <div className="ai-steps">
      {steps.map((s, i) => (
        <div key={i} className={`ai-step-row ${s.status}`}>
          <span className="ai-step-dot" />
          <span className="ai-step-name">{STEP_LABELS[s.step] ?? s.step}</span>
          <span className="ai-step-time">{fmtTime(s.timestamp)}</span>
        </div>
      ))}
    </div>
  )
}

function ScoreBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const cls = pct >= 70 ? 'score-bar-fill high' : pct >= 45 ? 'score-bar-fill mid' : 'score-bar-fill low'
  return (
    <div className="score-bar-track">
      <div className={cls} style={{ width: `${pct}%` }} />
    </div>
  )
}

function ShortlistCard({ entry }: { entry: ShortlistEntry }) {
  const pct = Math.round(entry.overall_score * 100)
  const recClass = entry.recommendation?.toLowerCase().includes('strong')
    ? 'rec-strong'
    : entry.recommendation?.toLowerCase().includes('good')
    ? 'rec-good'
    : 'rec-weak'

  return (
    <div className="candidate-card">
      <div className="candidate-header">
        <div className="candidate-avatar">{(entry.candidate_name ?? `#${entry.candidate_id}`)[0].toUpperCase()}</div>
        <div className="candidate-info">
          <span className="candidate-name">{entry.candidate_name ?? `Candidate #${entry.candidate_id}`}</span>
          <span className={`rec-badge ${recClass}`}>{entry.recommendation}</span>
        </div>
        <div className="candidate-score">{pct}%</div>
      </div>
      <ScoreBar value={entry.overall_score} />
      {(entry.skills_score !== undefined || entry.location_score !== undefined) && (
        <div className="score-breakdown">
          {entry.skills_score !== undefined && (
            <span className="score-dim">Skills {fmtScore(entry.skills_score)}</span>
          )}
          {entry.location_score !== undefined && (
            <span className="score-dim">Location {fmtScore(entry.location_score)}</span>
          )}
          {entry.seniority_score !== undefined && (
            <span className="score-dim">Seniority {fmtScore(entry.seniority_score)}</span>
          )}
        </div>
      )}
    </div>
  )
}

function OutreachCard({ draft, index }: { draft: OutreachDraft; index: number }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="outreach-card">
      <div className="outreach-header" onClick={() => setExpanded((v) => !v)}>
        <div className="outreach-meta">
          <span className="outreach-to">{draft.candidate_name ?? `Candidate ${index + 1}`}</span>
          <span className="outreach-score">{fmtScore(draft.match_score)} match</span>
        </div>
        <div className="outreach-subject">{draft.subject}</div>
        <span className="outreach-chevron">{expanded ? '▴' : '▾'}</span>
      </div>
      {expanded && (
        <div className="outreach-body">
          <pre className="outreach-text">{draft.body}</pre>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function AiDashboard() {
  // ── task list state ──────────────────────────────────────────────
  const [tasks, setTasks] = useState<TaskSummary[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)

  // ── new task form ────────────────────────────────────────────────
  const [jobId, setJobId] = useState('')
  const [topN, setTopN] = useState('5')
  const [startLoading, setStartLoading] = useState(false)
  const [startErr, setStartErr] = useState<string | null>(null)

  // ── selected task ────────────────────────────────────────────────
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const { taskState, wsStatus } = useAiTaskWs(selectedTaskId)

  // ── approval ─────────────────────────────────────────────────────
  const [feedback, setFeedback] = useState('')
  const [approvalLoading, setApprovalLoading] = useState(false)
  const [approvalMsg, setApprovalMsg] = useState<string | null>(null)

  // ── resume / match tools ─────────────────────────────────────────
  const [resumeText, setResumeText] = useState(
    'Jane Smith | ML Engineer | jane@example.com\n\n5 years building recommendation systems with Python, PyTorch, and Spark. MS Statistics. Skills: Python, Kafka, AWS.',
  )
  const [resumeResult, setResumeResult] = useState<Record<string, unknown> | null>(null)
  const [resumeLoading, setResumeLoading] = useState(false)
  const [resumeErr, setResumeErr] = useState<string | null>(null)

  const [activeTool, setActiveTool] = useState<'dashboard' | 'resume'>('dashboard')

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
    setResumeLoading(true)
    setResumeErr(null)
    try {
      const r = await apiPost<{ success: boolean; data: Record<string, unknown> }>('/ai/parse-resume', {
        resume_text: resumeText,
      })
      setResumeResult(r.data ?? r)
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
            Standalone resume parsing — uses Ollama when available, falls back to heuristic parsing.
          </p>
          <textarea
            className="resume-input"
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            rows={8}
            spellCheck={false}
          />
          <button type="button" className="primary" onClick={handleParseResume} disabled={resumeLoading}>
            {resumeLoading ? 'Parsing…' : 'Parse resume'}
          </button>
          {resumeErr && <p className="error mt-sm">{resumeErr}</p>}
          {resumeResult && <pre className="json-out">{JSON.stringify(resumeResult, null, 2)}</pre>}
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
                <div className="ai-empty-icon">🤖</div>
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
                        <ShortlistCard key={i} entry={entry} />
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
