import { useState, useEffect } from 'react'
import { JobList } from './JobList'
import { JobDetails } from './JobDetails'
import { apiPost, parseStoredUser } from '../../api'

export interface JobPosting {
  job_id: number;
  company_id: number;
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

export function JobsPage() {
  const [jobs, setJobs] = useState<JobPosting[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [appliedJobIds, setAppliedJobIds] = useState<Set<number>>(new Set())
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)

  const selectedJob = jobs.find((j) => j.job_id === selectedId) ?? null

  const fetchJobs = async (searchKw = '') => {
    setLoading(true)
    try {
      const res = await apiPost<{ data: JobPosting[] }>('/jobs/search', {
        keyword: searchKw,
        page_size: 50
      })
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
      const res = await apiPost<{ data: { job_id: number }[] }>('/applications/byMember', {
        member_id: user.user_id,
        page_size: 100
      })
      const ids = new Set(res.data?.map((a) => a.job_id) || [])
      setAppliedJobIds(ids)
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
    <div className="jobs-page">
      <div className="jobs-page__search-bar" style={{ padding: '16px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: '8px' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', flex: 1, gap: '8px' }}>
          <input 
            type="text" 
            placeholder="Search jobs by title or keyword..." 
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ flex: 1, padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border-light)' }}
          />
          <button type="submit" style={{ padding: '8px 16px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>
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
            />
          )}
        </div>

        {/* Right: selected job detail */}
        <div className="jobs-page__right">
          <JobDetails 
            job={selectedJob} 
            isApplied={selectedJob ? appliedJobIds.has(selectedJob.job_id) : false}
            onApplySuccess={() => {
              if (selectedJob) {
                setAppliedJobIds(new Set(appliedJobIds).add(selectedJob.job_id))
              }
            }}
          />
        </div>
      </div>
    </div>
  )
}
