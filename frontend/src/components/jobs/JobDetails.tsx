import { useState } from 'react'
import type { JobPosting } from './JobsPage'
import { apiPost, parseStoredUser } from '../../api'

interface JobDetailsProps {
  job: JobPosting | null
  isApplied: boolean
  onApplySuccess: () => void
}

export function JobDetails({ job, isApplied, onApplySuccess }: JobDetailsProps) {
  const [applying, setApplying] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showToast, setShowToast] = useState(false)

  // Reset state when job changes
  const [prevJobId, setPrevJobId] = useState<number | null>(null)
  if (job && job.job_id !== prevJobId) {
    setPrevJobId(job.job_id)
    setSaved(false)
    setShowToast(false)
  }

  if (!job) {
    return (
      <div className="jobs-detail-panel jobs-detail-panel--empty">
        <div className="jobs-detail-empty">
          <div className="jobs-detail-empty__icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
            </svg>
          </div>
          <h3 className="jobs-detail-empty__title">Select a job to view details</h3>
          <p className="jobs-detail-empty__sub">Click on any job from the list to see the full description, requirements, and apply.</p>
        </div>
      </div>
    )
  }

  const handleApply = async () => {
    const user = parseStoredUser()
    if (!user) return alert('Please log in to apply.')
    
    setApplying(true)
    try {
      await apiPost('/applications/submit', {
        job_id: job.job_id,
        member_id: user.user_id,
        resume_url: 'https://example.com/resume.pdf',
        resume_text: 'My frontend engineer resume',
        answers: {}
      })
      setShowToast(true)
      onApplySuccess()
      setTimeout(() => setShowToast(false), 3000)
    } catch (e: any) {
      alert(`Failed to apply: ${e.message}`)
    } finally {
      setApplying(false)
    }
  }

  const handleSave = async () => {
    if (saved) {
       setSaved(false)
       return
    }
    const user = parseStoredUser()
    if (!user) return alert('Please log in to save jobs.')
    try {
      await apiPost('/jobs/save', {
        job_id: job.job_id,
        member_id: user.user_id
      })
      setSaved(true)
    } catch (e: any) {
      if (e.message.includes('already saved')) setSaved(true)
      else alert(`Failed to save: ${e.message}`)
    }
  }

  const companyName = `Company #${job.company_id || 'Unknown'}`
  const companyLogo = companyName.charAt(0)
  const dateStr = new Date(job.posted_datetime).toLocaleDateString()
  
  let skillsList: string[] = []
  if (Array.isArray(job.skills_required)) {
    skillsList = job.skills_required
  } else if (typeof job.skills_required === 'string') {
    try {
      skillsList = JSON.parse(job.skills_required)
    } catch (e) {
      skillsList = [(job as any).skills_required]
    }
  }

  return (
    <div className="jobs-detail-panel">
      {/* Toast notification */}
      {showToast && (
        <div className="jobs-detail-toast">
          <span className="jobs-detail-toast__icon">✓</span>
          <span>Application submitted successfully</span>
          <button
            type="button"
            className="jobs-detail-toast__close"
            onClick={() => setShowToast(false)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Sticky header */}
      <div className="jobs-detail__header">
        <div className="jobs-detail__company-row">
          <div className="jobs-detail__logo">
            <span>{companyLogo}</span>
          </div>
          <div>
            <p className="jobs-detail__company-name">{companyName}</p>
          </div>
        </div>

        <h2 className="jobs-detail__title">{job.title}</h2>
        <p className="jobs-detail__meta-line">
          {job.location} · {dateStr}
        </p>
        <p className="jobs-detail__applicants">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 4 }}>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          {job.applicants_count} applicants · {job.views_count} views
        </p>

        <div className="jobs-detail__tags">
          <span className="jobs-detail__tag">{job.work_mode}</span>
          <span className="jobs-detail__tag">{job.employment_type}</span>
          {job.salary_min && job.salary_max && (
            <span className="jobs-detail__tag jobs-detail__tag--salary">
              ${job.salary_min.toLocaleString()} - ${job.salary_max.toLocaleString()}/yr
            </span>
          )}
        </div>

        <div className="jobs-detail__actions">
          <button
            type="button"
            className={`jobs-detail__apply-btn${isApplied ? ' jobs-detail__apply-btn--applied' : ''}`}
            onClick={handleApply}
            disabled={isApplied || applying}
          >
            {isApplied ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                Applied
              </>
            ) : applying ? (
              'Applying...'
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2 11 13" />
                  <path d="M22 2 15 22 11 13 2 9l20-7z" />
                </svg>
                Apply
              </>
            )}
          </button>
          <button
            type="button"
            className={`jobs-detail__save-btn${saved ? ' jobs-detail__save-btn--saved' : ''}`}
            onClick={handleSave}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="jobs-detail__body">
        {/* About the job */}
        <section className="jobs-detail__section">
          <h3 className="jobs-detail__section-title">About the job</h3>
          <div className="jobs-detail__text" style={{ whiteSpace: 'pre-wrap' }}>{job.description}</div>
        </section>

        {/* Required skills */}
        {skillsList.length > 0 && (
          <section className="jobs-detail__section">
            <h3 className="jobs-detail__section-title">Required skills</h3>
            <div className="jobs-detail__skills">
              {skillsList.map((skill) => (
                <span key={skill} className="jobs-detail__skill-pill">{skill}</span>
              ))}
            </div>
          </section>
        )}

        {/* About the company */}
        <section className="jobs-detail__section">
          <h3 className="jobs-detail__section-title">About the company</h3>
          <div className="jobs-detail__company-info">
            <div className="jobs-detail__company-info-logo">
              <span>{companyLogo}</span>
            </div>
            <div>
              <p className="jobs-detail__company-info-name">{companyName}</p>
              <p className="jobs-detail__company-info-text">We are {companyName}, a growing company looking for top talent. Apply to learn more about our culture and mission.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
