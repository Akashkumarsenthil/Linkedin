import { useState } from 'react'
import type { JobPosting } from './JobsPage'
import { apiPost, parseStoredUser } from '../../api'
import { EasyApplyModal } from './EasyApplyModal'

export type JobDetailsApplicationSummary = {
  statusLabel: string
  appliedAtLabel: string
  variant: 'good' | 'bad' | 'neutral'
}

interface JobDetailsProps {
  job: JobPosting | null
  isApplied: boolean
  onApplySuccess: (payload?: { applicationId?: number }) => void
  readOnly?: boolean
  onNavigateAi?: (jobId: number) => void
  applicationId?: number | null
  isSaved?: boolean
  applicationSummary?: JobDetailsApplicationSummary
  onWithdrawSuccess?: () => void
  onSaveChange?: (jobId: number, shouldSave: boolean) => void
}

export function JobDetails({
  job,
  isApplied,
  onApplySuccess,
  readOnly = false,
  onNavigateAi,
  applicationId = null,
  isSaved: isSavedProp,
  applicationSummary,
  onWithdrawSuccess,
  onSaveChange,
}: JobDetailsProps) {
  const user = parseStoredUser()
  const isRecruiter = user?.user_type === 'recruiter'
  const [easyApplyOpen, setEasyApplyOpen] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [savedLocal, setSavedLocal] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const [showSignInModal, setShowSignInModal] = useState(false)

  const controlledSave = isSavedProp !== undefined
  const savedDisplay = controlledSave ? Boolean(isSavedProp) : savedLocal

  const [prevJobId, setPrevJobId] = useState<number | null>(null)
  if (job && job.job_id !== prevJobId) {
    setPrevJobId(job.job_id)
    if (!controlledSave) setSavedLocal(false)
    setShowToast(false)
    setWithdrawing(false)
    setEasyApplyOpen(false)
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

  const openEasyApply = () => {
    const currentUser = parseStoredUser()
    if (!currentUser) {
      setShowSignInModal(true)
      return
    }
    setEasyApplyOpen(true)
  }

  const finishApplySuccess = (payload?: { applicationId?: number }) => {
    setEasyApplyOpen(false)
    setShowToast(true)
    onApplySuccess(payload)
    setTimeout(() => setShowToast(false), 3000)
  }

  const handleWithdraw = async () => {
    if (applicationId == null || applicationId <= 0) return
    if (!window.confirm('Withdraw this application? You can apply again later.')) return
    setWithdrawing(true)
    try {
      const r = await apiPost<{ success?: boolean; message?: string }>('/applications/withdraw', {
        application_id: applicationId,
      })
      if (r.success === false) {
        throw new Error(r.message || 'Could not withdraw application')
      }
      onWithdrawSuccess?.()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Withdraw failed')
    } finally {
      setWithdrawing(false)
    }
  }

  const handleSave = async () => {
    const currentUser = parseStoredUser()
    if (!currentUser) return alert('Please log in to save jobs.')
    if (savedDisplay) {
      try {
        await apiPost('/jobs/unsave', {
          job_id: job.job_id,
          member_id: currentUser.user_id,
        })
        onSaveChange?.(job.job_id, false)
        if (!controlledSave) setSavedLocal(false)
      } catch (e: unknown) {
        alert(`Failed to remove save: ${e instanceof Error ? e.message : 'Unknown error'}`)
      }
      return
    }
    try {
      await apiPost('/jobs/save', {
        job_id: job.job_id,
        member_id: currentUser.user_id,
      })
      onSaveChange?.(job.job_id, true)
      if (!controlledSave) setSavedLocal(true)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('already saved')) {
        if (!controlledSave) setSavedLocal(true)
        onSaveChange?.(job.job_id, true)
      } else alert(`Failed to save: ${msg}`)
    }
  }

  const companyName = job.company_name || `Company #${job.company_id || 'Unknown'}`
  const companyLogo = companyName.charAt(0)
  const dateStr = new Date(job.posted_datetime).toLocaleDateString()

  let skillsList: string[] = []
  if (Array.isArray(job.skills_required)) {
    skillsList = job.skills_required
  } else if (typeof job.skills_required === 'string') {
    try {
      skillsList = JSON.parse(job.skills_required)
    } catch {
      skillsList = [job.skills_required as unknown as string]
    }
  }

  const canWithdraw = !isRecruiter && applicationId != null && applicationId > 0

  return (
    <div className="jobs-detail-panel">
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

        {applicationSummary && (
          <div className={`jobs-detail__app-summary jobs-detail__app-summary--${applicationSummary.variant}`}>
            <span className="jobs-detail__app-summary-status">{applicationSummary.statusLabel}</span>
            {applicationSummary.appliedAtLabel ? (
              <span className="jobs-detail__app-summary-when">Applied {applicationSummary.appliedAtLabel}</span>
            ) : null}
          </div>
        )}

        {!readOnly && (
          <div className="jobs-detail__actions">
            {!isRecruiter && (
              <>
                <button
                  type="button"
                  className={`jobs-detail__apply-btn${isApplied ? ' jobs-detail__apply-btn--applied' : ''}`}
                  onClick={openEasyApply}
                  disabled={isApplied}
                >
                  {isApplied ? (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                      Applied
                    </>
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
                {canWithdraw && (
                  <button
                    type="button"
                    className="jobs-detail__withdraw-btn"
                    onClick={() => void handleWithdraw()}
                    disabled={withdrawing}
                  >
                    {withdrawing ? 'Withdrawing…' : 'Withdraw application'}
                  </button>
                )}
                <button
                  type="button"
                  className={`jobs-detail__save-btn${savedDisplay ? ' jobs-detail__save-btn--saved' : ''}`}
                  onClick={() => void handleSave()}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill={savedDisplay ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  </svg>
                  {savedDisplay ? 'Saved' : 'Save'}
                </button>
              </>
            )}
            {isRecruiter && onNavigateAi && (
              <button
                type="button"
                className="jobs-detail__apply-btn"
                style={{ background: 'var(--accent)', color: 'white', border: 'none' }}
                onClick={() => onNavigateAi(job.job_id)}
              >
                AI Hiring Workflow
              </button>
            )}
          </div>
        )}
      </div>

      <div className="jobs-detail__body">
        <section className="jobs-detail__section">
          <h3 className="jobs-detail__section-title">About the job</h3>
          <div className="jobs-detail__text" style={{ whiteSpace: 'pre-wrap' }}>{job.description}</div>
        </section>

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
      {easyApplyOpen && user?.user_type === 'member' && (
        <EasyApplyModal
          jobId={job.job_id}
          jobTitle={job.title}
          companyName={companyName}
          memberId={user.user_id}
          onClose={() => setEasyApplyOpen(false)}
          onSuccess={finishApplySuccess}
        />
      )}

      {showSignInModal && (
        <div className="modal-overlay" onClick={() => setShowSignInModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380, padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
            <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 600 }}>Sign In Required</h3>
            <p style={{ margin: '0 0 20px', color: 'var(--text-sec)', fontSize: 14, lineHeight: 1.5 }}>
              Please sign in to apply for jobs.
            </p>
            <button
              type="button"
              className="primary"
              style={{ padding: '8px 32px', borderRadius: 24, fontSize: 14, fontWeight: 600 }}
              onClick={() => setShowSignInModal(false)}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
