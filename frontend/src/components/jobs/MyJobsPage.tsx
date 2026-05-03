import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiPost, parseStoredUser } from '../../api'
import { JobDetails } from './JobDetails'
import type { JobPosting } from './JobsPage'

type ApplicationRow = {
  application_id: number
  job_id: number
  member_id: number
  status: string
  application_datetime: string | null
}

function memberStatusLabel(status: string): string {
  const m: Record<string, string> = {
    submitted: 'Submitted',
    reviewing: 'In review',
    interview: 'Interview',
    offer: 'Shortlisted',
    rejected: 'Not selected',
  }
  return m[status] || status
}

function statusModifier(status: string): string {
  if (status === 'rejected') return 'bad'
  if (status === 'offer') return 'good'
  return 'neutral'
}

function coerceJob(d: Record<string, unknown>): JobPosting {
  return {
    job_id: Number(d.job_id),
    company_id: Number(d.company_id ?? 0),
    company_name: typeof d.company_name === 'string' ? d.company_name : undefined,
    recruiter_id: Number(d.recruiter_id ?? 0),
    title: String(d.title ?? ''),
    description: String(d.description ?? ''),
    seniority_level: String(d.seniority_level ?? ''),
    employment_type: String(d.employment_type ?? ''),
    location: String(d.location ?? ''),
    work_mode: String(d.work_mode ?? ''),
    skills_required: Array.isArray(d.skills_required) ? (d.skills_required as string[]) : [],
    salary_min: d.salary_min != null ? Number(d.salary_min) : null,
    salary_max: d.salary_max != null ? Number(d.salary_max) : null,
    posted_datetime: String(d.posted_datetime ?? ''),
    status: String(d.status ?? 'open'),
    views_count: Number(d.views_count ?? 0),
    applicants_count: Number(d.applicants_count ?? 0),
  }
}

export function MyJobsPage() {
  const user = parseStoredUser()
  // Stable primitives — parseStoredUser() returns a new object every render, so never use `user` in hook deps.
  const memberId = user?.user_type === 'member' ? user.user_id : null

  const [rows, setRows] = useState<{ app: ApplicationRow; job: JobPosting | null }[]>([])
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null)
  const [savedJobIds, setSavedJobIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (memberId == null) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const appsRes = await apiPost<{ success?: boolean; message?: string; data?: ApplicationRow[] }>(
        '/applications/byMember',
        { member_id: memberId, page: 1, page_size: 100 },
      )
      if (appsRes.success === false) {
        throw new Error(appsRes.message || 'Could not load your applications.')
      }
      const apps = (appsRes.data || []).slice().sort((a, b) => {
        const ta = a.application_datetime ? new Date(a.application_datetime).getTime() : 0
        const tb = b.application_datetime ? new Date(b.application_datetime).getTime() : 0
        return tb - ta
      })
      const jobIds = [...new Set(apps.map((a) => a.job_id))]
      const jobMap = new Map<number, JobPosting>()
      const chunk = 8
      for (let i = 0; i < jobIds.length; i += chunk) {
        const slice = jobIds.slice(i, i + chunk)
        await Promise.all(
          slice.map(async (jid) => {
            try {
              const jr = await apiPost<{ success?: boolean; data?: Record<string, unknown> }>('/jobs/get', {
                job_id: jid,
                member_id: memberId,
              })
              if (jr.success !== false && jr.data) jobMap.set(jid, coerceJob(jr.data))
            } catch {
              /* job may be deleted */
            }
          }),
        )
      }

      const merged = apps.map((app) => ({ app, job: jobMap.get(app.job_id) ?? null }))
      setRows(merged)
      setSelectedAppId(merged[0]?.app.application_id ?? null)

      try {
        const savedRes = await apiPost<{ data?: JobPosting[] }>('/jobs/savedByMember', {
          member_id: memberId,
          page_size: 100,
        })
        setSavedJobIds(new Set((savedRes.data || []).map((j) => j.job_id)))
      } catch {
        setSavedJobIds(new Set())
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load applications')
      setRows([])
      setSelectedAppId(null)
    } finally {
      setLoading(false)
    }
  }, [memberId])

  useEffect(() => {
    void load()
  }, [load])

  const selected = useMemo(
    () => rows.find((r) => r.app.application_id === selectedAppId) ?? null,
    [rows, selectedAppId],
  )

  if (!user || user.user_type !== 'member') {
    return (
      <div className="jobs-page">
        <div className="jobs-page__search-bar" style={{ padding: 16 }}>
          <p className="muted">Sign in as a member to see jobs you have applied to.</p>
        </div>
      </div>
    )
  }

  const appliedAt =
    selected?.app.application_datetime
      ? new Date(selected.app.application_datetime).toLocaleString()
      : ''

  return (
    <div className="jobs-page">
      <div
        className="jobs-page__search-bar"
        style={{ padding: '14px 16px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-light)' }}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>My jobs</h2>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-sec)' }}>
          Roles you applied to and your current application status (updates when recruiters act on your application).
        </p>
        <button type="button" className="ghost-btn" style={{ marginTop: 10 }} onClick={() => void load()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      <div className="jobs-page__layout">
        <div className="jobs-page__left">
          {loading ? (
            <div style={{ padding: 20, textAlign: 'center' }}>Loading your applications…</div>
          ) : error ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--error)' }}>{error}</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-sec)' }}>
              You have not applied to any jobs yet. Browse the Jobs tab to get started.
            </div>
          ) : (
            <div className="my-jobs-list">
              <div className="my-jobs-list__header">
                <span className="my-jobs-list__title">Your applications</span>
                <span className="my-jobs-list__count">{rows.length}</span>
              </div>
              <ul className="my-jobs-list__ul" role="list">
                {rows.map(({ app, job }) => {
                  const title = job?.title || `Job #${app.job_id}`
                  const company = job?.company_name || `Company #${job?.company_id ?? '?'}`
                  const applied = app.application_datetime
                    ? new Date(app.application_datetime).toLocaleDateString()
                    : '—'
                  const active = selectedAppId === app.application_id
                  return (
                    <li key={app.application_id}>
                      <button
                        type="button"
                        className={`my-jobs-row${active ? ' my-jobs-row--active' : ''}`}
                        onClick={() => setSelectedAppId(app.application_id)}
                      >
                        <div className="my-jobs-row__logo">
                          <span>{(company || '?').charAt(0)}</span>
                        </div>
                        <div className="my-jobs-row__body">
                          <div className="my-jobs-row__title">{title}</div>
                          <div className="my-jobs-row__meta">{company}</div>
                          <div className="my-jobs-row__foot">
                            <span className="my-jobs-row__applied">Applied {applied}</span>
                            <span className={`my-jobs-status my-jobs-status--${statusModifier(app.status)}`}>
                              {memberStatusLabel(app.status)}
                            </span>
                          </div>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
        <div className="jobs-page__right">
          {selected && !selected.job ? (
            <div className="jobs-detail-panel jobs-detail-panel--empty">
              <div className="jobs-detail-empty">
                <h3 className="jobs-detail-empty__title">Job details unavailable</h3>
                <p className="jobs-detail-empty__sub">
                  We could not load the posting for job #{selected.app.job_id}. Your application is still on file with
                  status <strong>{memberStatusLabel(selected.app.status)}</strong>
                  {selected.app.application_datetime
                    ? ` (applied ${new Date(selected.app.application_datetime).toLocaleString()}).`
                    : '.'}
                </p>
              </div>
            </div>
          ) : (
            <JobDetails
              job={selected?.job ?? null}
              isApplied={Boolean(selected?.job)}
              applicationId={selected?.job ? selected.app.application_id : null}
              isSaved={selected?.job ? savedJobIds.has(selected.job.job_id) : false}
              applicationSummary={
                selected?.job
                  ? {
                      statusLabel: memberStatusLabel(selected.app.status),
                      appliedAtLabel: appliedAt,
                      variant: statusModifier(selected.app.status) as 'good' | 'bad' | 'neutral',
                    }
                  : undefined
              }
              onApplySuccess={() => {}}
              onWithdrawSuccess={() => {
                void load()
              }}
              onSaveChange={(jobId, shouldSave) => {
                setSavedJobIds((prev) => {
                  const next = new Set(prev)
                  if (shouldSave) next.add(jobId)
                  else next.delete(jobId)
                  return next
                })
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
