import { useEffect, useMemo, useState } from 'react'
import { JobList } from './JobList'
import { JobDetails } from './JobDetails'
import { apiPost, parseStoredUser } from '../../api'
import { RecruiterJobsPage } from './RecruiterJobsPage'

export interface JobPosting {
  job_id: number;
  company_id: number;
  company_name?: string;
  recruiter_id: number;
  title: string;
  description: string;
  seniority_level: string;
  employment_type: string;
  location: string;
  work_mode: string;
  skills_required: string[];
  salary_min: number | null;
  salary_max: number | null;
  posted_datetime: string;
  status: string;
  views_count: number;
  applicants_count: number;
}

export function JobsPage({ onNavigateProfile }: { onNavigateProfile?: (id: number) => void }) {
  const user = parseStoredUser()
  if (user?.user_type === 'recruiter') {
    return <RecruiterJobsPage onNavigateProfile={onNavigateProfile} />
  }

  const [jobs, setJobs] = useState<JobPosting[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  /** job_id → application_id — needed for withdraw + applied UI */
  const [appliedByJobId, setAppliedByJobId] = useState<Map<number, number>>(new Map())
  const appliedJobIds = useMemo(() => new Set(appliedByJobId.keys()), [appliedByJobId])
  const [savedJobIds, setSavedJobIds] = useState<Set<number>>(new Set())
  const [keyword, setKeyword] = useState('')
  const [location, setLocation] = useState('')
  const [workMode, setWorkMode] = useState('')
  const [employmentType, setEmploymentType] = useState('')
  const [seniorityLevel, setSeniorityLevel] = useState('')
  const [salaryMin, setSalaryMin] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'views' | 'applicants'>('date')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)

  const selectedJob = jobs.find((j) => j.job_id === selectedId) ?? null

  const fetchJobs = async (options?: { reset?: boolean; cursor?: string }) => {
    const reset = options?.reset ?? true
    const cursor = options?.cursor
    if (reset) setLoading(true)
    else setLoadingMore(true)
    try {
      const res = await apiPost<{ data: JobPosting[]; next_cursor?: string | null; has_more?: boolean }>('/jobs/search', {
        keyword,
        location: location || undefined,
        work_mode: workMode || undefined,
        employment_type: employmentType || undefined,
        seniority_level: seniorityLevel || undefined,
        salary_min: salaryMin ? Number(salaryMin) : undefined,
        sort_by: sortBy,
        cursor,
        page_size: 20
      })
      const incoming = res.data || []
      setJobs((prev) => (reset ? incoming : [...prev, ...incoming]))
      setNextCursor(res.next_cursor || null)
      setHasMore(Boolean(res.has_more))
      if (incoming.length && (reset || !selectedId)) setSelectedId(incoming[0].job_id)
    } catch (e) {
      console.error(e)
    } finally {
      if (reset) setLoading(false)
      else setLoadingMore(false)
    }
  }

  const fetchHistory = async () => {
    const user = parseStoredUser()
    if (!user || user.user_type !== 'member') return
    try {
      const res = await apiPost<{ data: { job_id: number; application_id: number }[] }>('/applications/byMember', {
        member_id: user.user_id,
        page: 1,
        page_size: 100
      })
      const m = new Map<number, number>()
      for (const a of res.data || []) {
        if (typeof a.job_id === 'number' && typeof a.application_id === 'number') m.set(a.job_id, a.application_id)
      }
      setAppliedByJobId(m)
    } catch (e) {
      console.error(e)
    }
  }

  const fetchSavedJobs = async () => {
    const user = parseStoredUser()
    if (!user || user.user_type !== 'member') return
    try {
      const res = await apiPost<{ data: { job_id: number }[] }>('/jobs/savedByMember', {
        member_id: user.user_id,
        page_size: 100
      })
      setSavedJobIds(new Set((res.data || []).map((j) => j.job_id)))
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    void fetchJobs({ reset: true })
    void fetchHistory()
    void fetchSavedJobs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const trackSelectedView = async () => {
      const user = parseStoredUser()
      if (!selectedId || !user || user.user_type !== 'member') return
      try {
        const res = await apiPost<{ data?: JobPosting }>('/jobs/get', {
          job_id: selectedId,
          member_id: user.user_id,
        })
        if (res?.data) {
          setJobs((prev) => prev.map((j) => (j.job_id === selectedId ? { ...j, ...res.data } : j)))
        }
      } catch {
        // non-blocking view tracking
      }
    }
    void trackSelectedView()
  }, [selectedId])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    void fetchJobs({ reset: true })
  }

  const handleDismiss = (id: number) => {
    setJobs((prev) => prev.filter((j) => j.job_id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const handleClearFilters = () => {
    setKeyword('')
    setLocation('')
    setWorkMode('')
    setEmploymentType('')
    setSeniorityLevel('')
    setSalaryMin('')
    setSortBy('date')
    setTimeout(() => {
      void fetchJobs({ reset: true })
    }, 0)
  }

  return (
    <div className="jobs-page">
      <div className="jobs-page__search-bar" style={{ padding: '16px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', flex: 1, gap: '8px', flexWrap: 'wrap' }}>
          <input type="text" placeholder="Keyword" value={keyword} onChange={(e) => setKeyword(e.target.value)} style={{ flex: 1, minWidth: '200px', padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border-light)' }} />
          <input type="text" placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} style={{ minWidth: '150px', padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border-light)' }} />
          <select value={workMode} onChange={(e) => setWorkMode(e.target.value)} style={{ minWidth: '130px', padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border-light)' }}>
            <option value="">Work mode</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">Onsite</option>
          </select>
          <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} style={{ minWidth: '150px', padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border-light)' }}>
            <option value="">Employment type</option>
            <option value="Full-time">Full-time</option>
            <option value="Part-time">Part-time</option>
            <option value="Contract">Contract</option>
            <option value="Internship">Internship</option>
          </select>
          <select value={seniorityLevel} onChange={(e) => setSeniorityLevel(e.target.value)} style={{ minWidth: '130px', padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border-light)' }}>
            <option value="">Experience</option>
            <option value="Entry">Entry</option>
            <option value="Mid">Mid</option>
            <option value="Senior">Senior</option>
            <option value="Director">Director</option>
          </select>
          <input type="number" min={0} placeholder="Min salary" value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} style={{ width: '120px', padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border-light)' }} />
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'date' | 'views' | 'applicants')} style={{ minWidth: '145px', padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border-light)' }}>
            <option value="date">Most recent</option>
            <option value="views">Most viewed</option>
            <option value="applicants">Most applicants</option>
          </select>
          <button type="button" onClick={handleClearFilters} style={{ padding: '8px 14px', background: 'transparent', color: 'var(--text-sec)', border: '1px solid var(--border-light)', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>Clear</button>
          <button type="submit" style={{ padding: '8px 16px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>Search</button>
        </form>
      </div>
      <div className="jobs-page__layout">
        <div className="jobs-page__left">
          {loading ? (
            <div style={{ padding: '20px', textAlign: 'center' }}>Loading jobs...</div>
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
          {!loading && hasMore && (
            <div style={{ padding: '10px 14px' }}>
              <button
                type="button"
                onClick={() => void fetchJobs({ reset: false, cursor: nextCursor || undefined })}
                disabled={loadingMore}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-panel)', cursor: 'pointer', fontWeight: 600 }}
              >
                {loadingMore ? 'Loading...' : 'Load more jobs'}
              </button>
            </div>
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
              void fetchHistory()
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
            }}
          />
        </div>
      </div>
    </div>
  )
}
