import { useState, useEffect } from 'react'
import { JobList } from './JobList'
import { JobDetails } from './JobDetails'
import { apiPost, parseStoredUser } from '../../api'

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

interface JobsPageProps {
  onNavigateProfile?: (id: number | null) => void;
  onNavigateAi?: (jobId: number) => void;
}

export function JobsPage({ onNavigateProfile, onNavigateAi }: JobsPageProps) {
  const [jobs, setJobs] = useState<JobPosting[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [appliedJobIds, setAppliedJobIds] = useState<Set<number>>(new Set())
  const [appliedByJobId, setAppliedByJobId] = useState<Map<number, number>>(new Map())
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)

  const readOnly = parseStoredUser()?.user_type === 'admin'

  const selectedJob = jobs.find((j) => j.job_id === selectedId) ?? null

  const fetchJobs = async (searchKw = '') => {
    setLoading(true)
    try {
      const user = parseStoredUser()
      let res;
      if (user?.user_type === 'recruiter') {
        res = await apiPost<{ data: JobPosting[] }>('/jobs/byRecruiter', {
          recruiter_id: user.user_id,
          page_size: 50
        })
      } else {
        res = await apiPost<{ data: JobPosting[] }>('/jobs/search', {
          keyword: searchKw,
          page_size: 50
        })
      }
      setJobs(res.data || [])
      if (res.data?.length && !selectedId) {
        setSelectedId(res.data[0].job_id)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const fetchHistory = async () => {
    const user = parseStoredUser()
    if (!user || user.user_type !== 'member') return
    try {
      const res = await apiPost<{ data: { job_id: number; application_id: number }[] }>('/applications/byMember', {
        member_id: user.user_id,
        page_size: 100
      })
      const rows = res.data || []
      setAppliedJobIds(new Set(rows.map((a) => a.job_id)))
      setAppliedByJobId(new Map(rows.map((a) => [a.job_id, a.application_id])))
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    fetchJobs()
    fetchHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchJobs(keyword)
  }

  const handleDismiss = (id: number) => {
    setJobs((prev) => prev.filter((j) => j.job_id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  return (
    <div className="jobs-page premium-panel">
      <div className="jobs-page__search-bar premium-header" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <h2 className="premium-title">Job Search</h2>
          <p className="premium-subtitle">Find your next opportunity</p>
        </div>
        <form onSubmit={handleSearch} style={{ display: 'flex', flex: 1, gap: '8px' }}>
          <input 
            type="text" 
            placeholder="Search jobs by title or keyword..." 
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ flex: 1, padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--li-border)', background: '#f9fafb' }}
          />
          <button type="submit" style={{ padding: '8px 20px', background: 'var(--li-link)', color: 'white', border: 'none', borderRadius: '16px', cursor: 'pointer', fontWeight: 600 }}>
            Search
          </button>
        </form>
      </div>
      <div className="jobs-page__layout">
        {/* Left: scrollable job list */}
        <div className="jobs-page__left">
          {loading ? (
            <div style={{ padding: '20px', textAlign: 'center' }}>Loading jobs...</div>
          ) : (
            <JobList
              jobs={jobs}
              selectedId={selectedId}
              appliedJobIds={appliedJobIds}
              onSelect={setSelectedId}
              onDismiss={handleDismiss}
              readOnly={readOnly}
            />
          )}
        </div>

        {/* Right: selected job detail */}
        <div className="jobs-page__right">
          <JobDetails
            job={selectedJob}
            isApplied={selectedJob ? appliedJobIds.has(selectedJob.job_id) : false}
            applicationId={selectedJob ? appliedByJobId.get(selectedJob.job_id) ?? null : null}
            onApplySuccess={(payload) => {
              if (selectedJob) {
                setAppliedJobIds((prev) => new Set(prev).add(selectedJob.job_id))
                if (payload?.applicationId != null) {
                  setAppliedByJobId((prev) => new Map(prev).set(selectedJob.job_id, payload.applicationId))
                }
              }
            }}
            onWithdrawSuccess={() => {
              if (!selectedJob) return
              const jid = selectedJob.job_id
              setAppliedJobIds((prev) => {
                const next = new Set(prev)
                next.delete(jid)
                return next
              })
              setAppliedByJobId((prev) => {
                const next = new Map(prev)
                next.delete(jid)
                return next
              })
              setJobs((prev) =>
                prev.map((j) =>
                  j.job_id === jid
                    ? { ...j, applicants_count: Math.max(0, (j.applicants_count ?? 0) - 1) }
                    : j,
                ),
              )
            }}
            readOnly={readOnly}
            onNavigateAi={onNavigateAi}
          />
        </div>
      </div>
    </div>
  )
}
