import { useEffect, useState } from 'react'
import { apiPost } from '../api'

interface JobDetailResponse {
  success: boolean
  message: string
  data?: Record<string, unknown>
}

interface Props {
  jobId: number | null
  onClose: () => void
}

export function JobDetailPanel({ jobId, onClose }: Props) {
  const [job, setJob] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (jobId === null) {
      setJob(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setErr(null)
    setJob(null)

    apiPost<JobDetailResponse>('/jobs/get', { job_id: jobId })
      .then((r) => {
        if (cancelled) return
        if (r.success && r.data) setJob(r.data)
        else setErr(r.message)
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load job')
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [jobId])

  if (jobId === null) return null

  const salaryMin = job?.salary_min ? Number(job.salary_min) : null
  const salaryMax = job?.salary_max ? Number(job.salary_max) : null
  const skills = Array.isArray(job?.skills_required) ? (job!.skills_required as string[]) : []
  const postedDate = job?.posted_datetime
    ? String(job.posted_datetime).substring(0, 10)
    : null

  return (
    <div className="job-detail-panel">
      <div className="job-detail-header">
        <h3 className="job-detail-title">
          {loading ? 'Loading…' : job ? String(job.title) : `Job #${jobId}`}
        </h3>
        <button type="button" className="ghost-btn" onClick={onClose}>
          ✕ Close
        </button>
      </div>

      {loading && <p className="meta">Fetching job details…</p>}
      {err && <p className="error">{err}</p>}

      {job != null && (
        <div className="job-detail-body">
          {/* Status + meta pills */}
          <div className="job-detail-meta">
            <span className={`job-status-badge job-status-${String(job.status)}`}>
              {String(job.status)}
            </span>
            {job.seniority_level ? <span className="pill">{String(job.seniority_level)}</span> : null}
            {job.employment_type ? <span className="pill">{String(job.employment_type)}</span> : null}
            {job.work_mode ? <span className="pill">{String(job.work_mode)}</span> : null}
          </div>

          {/* Location + stats */}
          <div className="job-detail-stats">
            {job.location ? <span>📍 {String(job.location)}</span> : null}
            <span>{String(job.views_count ?? 0)} views</span>
            <span>{String(job.applicants_count ?? 0)} applicants</span>
            {postedDate && <span>Posted {postedDate}</span>}
            <span className="muted">ID #{String(job.job_id)}</span>
          </div>

          {/* Salary */}
          {(salaryMin !== null || salaryMax !== null) ? (
            <p className="job-detail-salary">
              💰{' '}
              {salaryMin !== null ? `$${salaryMin.toLocaleString()}` : '—'}
              {salaryMax !== null ? ` – $${salaryMax.toLocaleString()}` : '+'}
              {' '}/ year
            </p>
          ) : null}

          {/* Skills */}
          {skills.length > 0 && (
            <div className="job-detail-section">
              <p className="chart-label">Skills required</p>
              <div className="skills-pill-row">
                {skills.map((s) => (
                  <span key={s} className="pill">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {job.description ? (
            <div className="job-detail-section">
              <p className="chart-label">Description</p>
              <p className="job-desc-text">{String(job.description)}</p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
