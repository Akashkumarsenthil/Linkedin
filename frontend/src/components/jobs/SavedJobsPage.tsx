import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiPost, parseStoredUser } from '../../api'
import { JobDetails } from './JobDetails'
import { JobList } from './JobList'
import type { JobPosting } from './JobsPage'

export function SavedJobsPage() {
  const [jobs, setJobs] = useState<JobPosting[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [appliedByJobId, setAppliedByJobId] = useState<Map<number, number>>(new Map())
  const appliedJobIds = useMemo(() => new Set(appliedByJobId.keys()), [appliedByJobId])
  const [savedJobIds, setSavedJobIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)

  const selectedJob = jobs.find((j) => j.job_id === selectedId) ?? null

  const refetchApplications = useCallback(async () => {
    const user = parseStoredUser()
    if (!user || user.user_type !== 'member') return
    try {
      const appRes = await apiPost<{ data: { job_id: number; application_id: number }[] }>(
        '/applications/byMember',
        { member_id: user.user_id, page: 1, page_size: 100 },
      )
      const m = new Map<number, number>()
      for (const a of appRes.data || []) {
        if (typeof a.job_id === 'number' && typeof a.application_id === 'number') m.set(a.job_id, a.application_id)
      }
      setAppliedByJobId(m)
    } catch {
      setAppliedByJobId(new Map())
    }
  }, [])

  const load = useCallback(async () => {
    const user = parseStoredUser()
    if (!user || user.user_type !== 'member') {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [savedRes, appRes] = await Promise.all([
        apiPost<{ data: JobPosting[] }>('/jobs/savedByMember', { member_id: user.user_id, page_size: 100 }),
        apiPost<{ data: { job_id: number; application_id: number }[] }>('/applications/byMember', {
          member_id: user.user_id,
          page: 1,
          page_size: 100,
        }).catch(() => ({ data: [] })),
      ])
      const savedJobs = savedRes.data || []
      setJobs(savedJobs)
      setSavedJobIds(new Set(savedJobs.map((j) => j.job_id)))
      const m = new Map<number, number>()
      for (const a of appRes.data || []) {
        if (typeof a.job_id === 'number' && typeof a.application_id === 'number') m.set(a.job_id, a.application_id)
      }
      setAppliedByJobId(m)
      if (savedJobs.length) setSelectedId((prev) => (prev != null && savedJobs.some((j) => j.job_id === prev) ? prev : savedJobs[0].job_id))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleDismiss = (id: number) => {
    setJobs((prev) => prev.filter((j) => j.job_id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  return (
    <div className="jobs-page">
      <div className="jobs-page__search-bar" style={{ padding: '14px 16px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-light)' }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Saved Jobs</h2>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-sec)' }}>
          Jobs you saved for later, similar to LinkedIn Saved Jobs.
        </p>
      </div>
      <div className="jobs-page__layout">
        <div className="jobs-page__left">
          {loading ? (
            <div style={{ padding: 20, textAlign: 'center' }}>Loading saved jobs...</div>
          ) : jobs.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-sec)' }}>No saved jobs yet.</div>
          ) : (
            <JobList
              jobs={jobs}
              selectedId={selectedId}
              appliedJobIds={appliedJobIds}
              savedJobIds={savedJobIds}
              onSelect={setSelectedId}
              onDismiss={handleDismiss}
            />
          )}
        </div>
        <div className="jobs-page__right">
          <JobDetails
            job={selectedJob}
            isApplied={selectedJob ? appliedJobIds.has(selectedJob.job_id) : false}
            applicationId={selectedJob ? appliedByJobId.get(selectedJob.job_id) ?? null : null}
            isSaved={selectedJob ? savedJobIds.has(selectedJob.job_id) : false}
            onApplySuccess={(payload) => {
              if (selectedJob && payload?.applicationId) {
                setAppliedByJobId((prev) => new Map(prev).set(selectedJob.job_id, payload.applicationId))
              }
            }}
            onWithdrawSuccess={() => {
              void refetchApplications()
              if (selectedJob) {
                setJobs((prev) =>
                  prev.map((j) =>
                    j.job_id === selectedJob.job_id
                      ? { ...j, applicants_count: Math.max(0, (j.applicants_count ?? 0) - 1) }
                      : j,
                  ),
                )
              }
            }}
            onSaveChange={(jobId, shouldSave) => {
              setSavedJobIds((prev) => {
                const next = new Set(prev)
                if (shouldSave) next.add(jobId)
                else next.delete(jobId)
                return next
              })
              if (!shouldSave) {
                setJobs((prev) => prev.filter((j) => j.job_id !== jobId))
                if (selectedId === jobId) setSelectedId(null)
              }
            }}
          />
        </div>
      </div>
    </div>
  )
}
