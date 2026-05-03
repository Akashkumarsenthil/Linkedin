import { useEffect, useMemo, useState } from 'react'
import { apiPost, parseStoredUser } from '../../api'
import type { JobPosting } from './JobsPage'

type RecruiterApplicantStatus = 'new' | 'reviewed' | 'shortlisted' | 'rejected'
type DetailTab = 'overview' | 'applicants' | 'analytics'

type ApplicationRecord = {
  application_id: number
  job_id: number
  member_id: number
  status: 'submitted' | 'reviewing' | 'rejected' | 'interview' | 'offer'
  application_datetime: string
  answers?: Record<string, unknown> | null
  resume_text?: string | null
  resume_url?: string | null
  cover_letter?: string | null
}

type MemberProfile = {
  member_id: number
  first_name?: string
  last_name?: string
  headline?: string
  location_city?: string
  location_state?: string
  skills?: string[]
  resume_text?: string | null
  resume_pdf_url?: string | null
  resume_filename?: string | null
}

type ApplicantView = ApplicationRecord & {
  displayStatus: RecruiterApplicantStatus
  memberName: string
  headline: string
  location: string
  skills: string[]
  /** Latest profile PDF (data URL or empty) — complements application snapshot */
  resume_pdf_url?: string | null
  resume_filename?: string | null
}

function applicantHasResumeContent(a: ApplicantView): boolean {
  const text = (a.resume_text ?? '').trim()
  const letter = (a.cover_letter ?? '').trim()
  const url = (a.resume_url ?? '').trim()
  const pdf = (a.resume_pdf_url ?? '').trim()
  return Boolean(text || letter || url || pdf)
}

type JobFunnel = {
  views: number
  applications: number
  view_to_apply_rate: number
}

function mapStatusToDisplay(status: ApplicationRecord['status']): RecruiterApplicantStatus {
  if (status === 'rejected') return 'rejected'
  if (status === 'offer') return 'shortlisted'
  if (status === 'reviewing' || status === 'interview') return 'reviewed'
  return 'new'
}

function mapDisplayToApiStatus(status: RecruiterApplicantStatus): ApplicationRecord['status'] {
  if (status === 'rejected') return 'rejected'
  if (status === 'shortlisted') return 'offer'
  if (status === 'reviewed') return 'reviewing'
  return 'submitted'
}

function parseDescriptionSections(description: string): { responsibilities: string[]; qualifications: string[] } {
  const lines = (description || '').split('\n').map((l) => l.trim()).filter(Boolean)
  const bullets = lines.filter((l) => l.startsWith('-') || l.startsWith('•')).map((l) => l.replace(/^[-•]\s*/, ''))
  const responsibilities = bullets.slice(0, 5)
  const qualifications = bullets.slice(5, 10)
  return {
    responsibilities: responsibilities.length ? responsibilities : ['Collaborate cross-functionally and deliver high-quality outcomes.'],
    qualifications: qualifications.length ? qualifications : ['Relevant experience, strong communication, and problem-solving skills.'],
  }
}

function mockUniqueViewers(totalViews: number): number {
  // Mock fallback until backend exposes unique viewer metrics.
  return Math.max(0, Math.round(totalViews * 0.68))
}

function AnalyticsCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rj-analytics-card">
      <div className="rj-analytics-card__label">{label}</div>
      <div className="rj-analytics-card__value">{value}</div>
    </div>
  )
}

export function RecruiterJobsPage({ onNavigateProfile, onNavigateAi }: { onNavigateProfile?: (id: number) => void; onNavigateAi?: (jobId: number) => void }) {
  const [jobs, setJobs] = useState<JobPosting[]>([])
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all')
  const [loadingJobs, setLoadingJobs] = useState(true)
  const [jobsError, setJobsError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<DetailTab>('overview')

  const [applicants, setApplicants] = useState<ApplicantView[]>([])
  const [applicantsError, setApplicantsError] = useState<string | null>(null)
  const [loadingApplicants, setLoadingApplicants] = useState(false)
  const [funnel, setFunnel] = useState<JobFunnel | null>(null)
  const [loadingAnalytics, setLoadingAnalytics] = useState(false)
  const [showPostModal, setShowPostModal] = useState(false)
  const [resumeViewer, setResumeViewer] = useState<ApplicantView | null>(null)
  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState<string | null>(null)
  const [recruiterCompanyName, setRecruiterCompanyName] = useState<string>('')
  const [recruiterCompanyId, setRecruiterCompanyId] = useState<number | null>(null)
  const [postForm, setPostForm] = useState({
    title: '',
    location: '',
    work_mode: 'onsite',
    employment_type: 'Full-time',
    seniority_level: 'Mid',
    salary_min: '',
    salary_max: '',
    skills_csv: '',
    description: '',
  })

  const user = parseStoredUser()
  const selectedJob = jobs.find((j) => j.job_id === selectedJobId) || null

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase()
    return jobs.filter((j) => {
      if (statusFilter !== 'all' && j.status !== statusFilter) return false
      if (!q) return true
      return (
        j.title.toLowerCase().includes(q) ||
        (j.company_name || `Company #${j.company_id}`).toLowerCase().includes(q) ||
        (j.location || '').toLowerCase().includes(q)
      )
    })
  }, [jobs, search, statusFilter])

  useEffect(() => {
    const loadJobs = async () => {
      if (!user || user.user_type !== 'recruiter') return
      setLoadingJobs(true)
      setJobsError(null)
      try {
        const res = await apiPost<{ success: boolean; data: JobPosting[] }>('/jobs/byRecruiter', {
          recruiter_id: user.user_id,
          page_size: 100,
        })
        const rows = res.data || []
        setJobs(rows)
        setSelectedJobId(rows[0]?.job_id ?? null)
      } catch (e: any) {
        setJobsError(e?.message || 'Failed to load recruiter jobs')
      } finally {
        setLoadingJobs(false)
      }
    }
    void loadJobs()
  }, [user?.user_id, user?.user_type])

  useEffect(() => {
    const loadRecruiterProfile = async () => {
      if (!user || user.user_type !== 'recruiter') return
      try {
        const res = await apiPost<{ data?: { company_name?: string; company_id?: number } }>('/recruiters/get', {
          recruiter_id: user.user_id,
        })
        setRecruiterCompanyName(res.data?.company_name || '')
        setRecruiterCompanyId(typeof res.data?.company_id === 'number' ? res.data.company_id : null)
      } catch {
        setRecruiterCompanyName('')
        setRecruiterCompanyId(null)
      }
    }
    void loadRecruiterProfile()
  }, [user?.user_id, user?.user_type])

  const loadApplicantsAndAnalytics = async () => {
    if (!selectedJob || !user || user.user_type !== 'recruiter') {
      setApplicants([])
      setFunnel(null)
      return
    }

    setLoadingApplicants(true)
    setLoadingAnalytics(true)
    setApplicantsError(null)
    try {
      // page_size must stay within backend `ApplicationByJob` limits (was 100 max; > max returned 422 and showed empty list).
      const appsRes = await apiPost<{ data: ApplicationRecord[]; success?: boolean; message?: string }>('/applications/byJob', {
        job_id: selectedJob.job_id,
        page: 1,
        page_size: 200,
      })
      if (appsRes.success === false) {
        throw new Error(appsRes.message || 'Could not load applications for this job.')
      }
      const appRows = appsRes.data || []
      setJobs((prev) => prev.map((j) => (
        j.job_id === selectedJob.job_id ? { ...j, applicants_count: appRows.length } : j
      )))

      const uniqueMemberIds = [...new Set(appRows.map((a) => a.member_id))]
      const memberMap = new Map<number, MemberProfile>()
      await Promise.all(uniqueMemberIds.map(async (memberId) => {
        try {
          const memberRes = await apiPost<{ data: MemberProfile }>('/members/get', { member_id: memberId })
          if (memberRes.data) memberMap.set(memberId, memberRes.data)
        } catch {
          // Keep fallback details if member API fetch fails.
        }
      }))

      const applicantRows: ApplicantView[] = appRows.map((a) => {
        const member = memberMap.get(a.member_id)
        const memberName = member ? `${member.first_name || ''} ${member.last_name || ''}`.trim() : `Member #${a.member_id}`
        const location = member ? [member.location_city, member.location_state].filter(Boolean).join(', ') : 'Unknown'
        const appResumeText = typeof a.resume_text === 'string' ? a.resume_text : null
        const memberResumeText = member?.resume_text != null ? String(member.resume_text) : null
        const mergedResumeText = (appResumeText ?? '').trim() || (memberResumeText ?? '').trim() || null
        return {
          ...a,
          resume_text: mergedResumeText,
          resume_url: a.resume_url ?? null,
          cover_letter: a.cover_letter ?? null,
          resume_pdf_url: member?.resume_pdf_url ?? null,
          resume_filename: member?.resume_filename ?? null,
          displayStatus: mapStatusToDisplay(a.status),
          memberName: memberName || `Member #${a.member_id}`,
          headline: member?.headline || 'Professional',
          location: location || 'Unknown',
          skills: Array.isArray(member?.skills) ? member!.skills.slice(0, 6) : [],
        }
      })
      setApplicants(applicantRows)

      try {
        const funnelRes = await apiPost<{ data: JobFunnel }>('/analytics/funnel', { job_id: selectedJob.job_id })
        setFunnel(funnelRes.data || null)
      } catch {
        setFunnel({
          views: selectedJob.views_count || 0,
          applications: appRows.length,
          view_to_apply_rate: selectedJob.views_count > 0 ? (appRows.length / selectedJob.views_count) * 100 : 0,
        })
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load applicants'
      setApplicantsError(msg)
      setApplicants([])
      setFunnel({
        views: selectedJob.views_count || 0,
        applications: 0,
        view_to_apply_rate: 0,
      })
    } finally {
      setLoadingApplicants(false)
      setLoadingAnalytics(false)
    }
  }

  useEffect(() => {
    void loadApplicantsAndAnalytics()
  }, [selectedJobId])

  useEffect(() => {
    if (activeTab === 'applicants') {
      void loadApplicantsAndAnalytics()
    }
  }, [activeTab])

  const statusBreakdown = useMemo(() => {
    const base = { new: 0, reviewed: 0, shortlisted: 0, rejected: 0 }
    applicants.forEach((a) => { base[a.displayStatus] += 1 })
    return base
  }, [applicants])

  const handleCloseJob = async () => {
    if (!selectedJob) return
    if (!confirm('Close this job posting?')) return
    try {
      await apiPost('/jobs/close', { job_id: selectedJob.job_id })
      setJobs((prev) => prev.map((j) => (j.job_id === selectedJob.job_id ? { ...j, status: 'closed' } : j)))
    } catch (e: any) {
      alert(`Failed to close job: ${e?.message || 'Unknown error'}`)
    }
  }

  const handleApplicantStatus = async (app: ApplicantView, next: RecruiterApplicantStatus) => {
    try {
      await apiPost('/applications/updateStatus', {
        application_id: app.application_id,
        status: mapDisplayToApiStatus(next),
      })
      setApplicants((prev) => prev.map((a) => (a.application_id === app.application_id ? { ...a, displayStatus: next } : a)))
    } catch (e: any) {
      alert(`Failed to update status: ${e?.message || 'Unknown error'}`)
    }
  }

  const openPostModal = () => {
    setPostError(null)
    setShowPostModal(true)
  }

  const closePostModal = () => {
    if (posting) return
    setShowPostModal(false)
    setPostError(null)
  }

  const resetPostForm = () => {
    setPostForm({
      title: '',
      location: '',
      work_mode: 'onsite',
      employment_type: 'Full-time',
      seniority_level: 'Mid',
      salary_min: '',
      salary_max: '',
      skills_csv: '',
      description: '',
    })
  }

  const submitPostJob = async () => {
    if (!user || user.user_type !== 'recruiter') return
    if (!postForm.title.trim()) {
      setPostError('Job title is required.')
      return
    }
    if (postForm.salary_min && postForm.salary_max && Number(postForm.salary_min) > Number(postForm.salary_max)) {
      setPostError('Minimum salary cannot exceed maximum salary.')
      return
    }

    setPosting(true)
    setPostError(null)
    try {
      const skills = postForm.skills_csv
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

      const res = await apiPost<{ data?: JobPosting; success?: boolean; message?: string }>('/jobs/create', {
        recruiter_id: user.user_id,
        company_id: recruiterCompanyId ?? undefined,
        title: postForm.title.trim(),
        description: postForm.description.trim() || undefined,
        location: postForm.location.trim() || undefined,
        work_mode: postForm.work_mode,
        employment_type: postForm.employment_type,
        seniority_level: postForm.seniority_level,
        salary_min: postForm.salary_min ? Number(postForm.salary_min) : undefined,
        salary_max: postForm.salary_max ? Number(postForm.salary_max) : undefined,
        skills_required: skills.length ? skills : undefined,
      })

      if (!res?.data) {
        throw new Error(res?.message || 'Job was not created.')
      }

      const created: JobPosting = {
        ...res.data,
        company_name: recruiterCompanyName || res.data.company_name || `Company #${res.data.company_id || 'Unknown'}`,
      }
      setJobs((prev) => [created, ...prev])
      setSelectedJobId(created.job_id)
      setActiveTab('overview')
      setShowPostModal(false)
      resetPostForm()
    } catch (e: any) {
      setPostError(e?.message || 'Failed to post job')
    } finally {
      setPosting(false)
    }
  }

  const overviewSections = parseDescriptionSections(selectedJob?.description || '')
  const totalViews = funnel?.views ?? selectedJob?.views_count ?? 0
  const totalApplicants = funnel?.applications ?? selectedJob?.applicants_count ?? applicants.length
  const conversionRate = totalViews > 0 ? ((totalApplicants / totalViews) * 100) : 0
  const uniqueViewers = mockUniqueViewers(totalViews)

  if (!user || user.user_type !== 'recruiter') {
    return <div className="jobs-page"><div style={{ padding: 20 }}>Recruiter Jobs is available for recruiter accounts only.</div></div>
  }

  return (
    <div className="jobs-page recruiter-jobs-page">
      <div className="rj-toolbar">
        <div className="rj-toolbar__left">
          <h2>Manage Jobs</h2>
          <p>Track postings, applicants, and job performance in one place.</p>
        </div>
        <button type="button" className="rj-post-btn" onClick={openPostModal}>
          Post a Job
        </button>
      </div>

      <div className="jobs-page__layout">
        <aside className="jobs-page__left rj-left">
          <div className="rj-filters">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your jobs" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | 'open' | 'closed')}>
              <option value="all">All statuses</option>
              <option value="open">Active</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          {loadingJobs ? (
            <div className="rj-empty">Loading posted jobs...</div>
          ) : jobsError ? (
            <div className="rj-empty rj-empty--error">{jobsError}</div>
          ) : filteredJobs.length === 0 ? (
            <div className="rj-empty">No jobs match your filters.</div>
          ) : (
            <ul className="rj-job-list">
              {filteredJobs.map((job) => (
                <li
                  key={job.job_id}
                  className={`rj-job-item${selectedJobId === job.job_id ? ' active' : ''}`}
                  onClick={() => { setSelectedJobId(job.job_id); setActiveTab('overview') }}
                >
                  <h4>{job.title}</h4>
                  <p>{job.company_name || `Company #${job.company_id}`}</p>
                  <p>{job.location} · {job.work_mode} · {job.employment_type}</p>
                  <div className="rj-job-item__meta">
                    <span className={`rj-status rj-status--${job.status === 'open' ? 'active' : 'closed'}`}>
                      {job.status === 'open' ? 'Active' : 'Closed'}
                    </span>
                    <span>{job.applicants_count} applicants</span>
                    <span>{job.views_count} views</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="jobs-page__right rj-right">
          {!selectedJob ? (
            <div className="rj-empty">Select a job to view details.</div>
          ) : (
            <div className="rj-detail">
              <header className="rj-detail__header">
                <div>
                  <h3>{selectedJob.title}</h3>
                  <p>{selectedJob.company_name || `Company #${selectedJob.company_id}`} · {selectedJob.location}</p>
                  <p>Posted {new Date(selectedJob.posted_datetime).toLocaleDateString()} · Status: {selectedJob.status === 'open' ? 'Active' : 'Closed'} · Job ID: {selectedJob.job_id}</p>
                </div>
                <div className="rj-detail__actions">
                  {onNavigateAi && (
                    <button type="button" style={{ background: 'var(--accent)', color: 'white', border: 'none' }} onClick={() => onNavigateAi(selectedJob.job_id)}>
                      AI Hiring Workflow
                    </button>
                  )}
                  <button type="button" onClick={handleCloseJob} disabled={selectedJob.status === 'closed'}>Close Job</button>
                </div>
              </header>

              <div className="rj-tabs">
                <button className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}>Overview</button>
                <button className={activeTab === 'applicants' ? 'active' : ''} onClick={() => setActiveTab('applicants')}>Applicants</button>
                <button className={activeTab === 'analytics' ? 'active' : ''} onClick={() => setActiveTab('analytics')}>Analytics</button>
              </div>

              {activeTab === 'overview' && (
                <div className="rj-tab-content">
                  <div className="rj-stat-grid">
                    <AnalyticsCard label="Total views" value={totalViews} />
                    <AnalyticsCard label="Total applicants" value={totalApplicants} />
                    <AnalyticsCard label="Shortlisted" value={statusBreakdown.shortlisted} />
                    <AnalyticsCard label="Rejected" value={statusBreakdown.rejected} />
                    <AnalyticsCard label="Conversion rate" value={`${conversionRate.toFixed(1)}%`} />
                  </div>
                  <section className="rj-section">
                    <h4>Job description</h4>
                    <p>{selectedJob.description || 'No description provided.'}</p>
                  </section>
                  <section className="rj-section">
                    <h4>Responsibilities</h4>
                    <ul>{overviewSections.responsibilities.map((r) => <li key={r}>{r}</li>)}</ul>
                  </section>
                  <section className="rj-section">
                    <h4>Qualifications</h4>
                    <ul>{overviewSections.qualifications.map((q) => <li key={q}>{q}</li>)}</ul>
                  </section>
                  <section className="rj-section">
                    <h4>Skills</h4>
                    <div className="rj-skill-row">
                      {(Array.isArray(selectedJob.skills_required) ? selectedJob.skills_required : []).map((s) => <span key={s}>{s}</span>)}
                    </div>
                  </section>
                </div>
              )}

              {activeTab === 'applicants' && (
                <div className="rj-tab-content">
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                    <button
                      type="button"
                      className="rj-post-modal__btn-secondary"
                      onClick={() => void loadApplicantsAndAnalytics()}
                      disabled={loadingApplicants}
                    >
                      {loadingApplicants ? 'Refreshing...' : 'Refresh applicants'}
                    </button>
                  </div>
                  {loadingApplicants ? (
                    <div className="rj-empty">Loading applicants...</div>
                  ) : applicantsError ? (
                    <div className="rj-empty rj-empty--error">
                      <strong>Could not load applicants.</strong> {applicantsError}
                    </div>
                  ) : applicants.length === 0 ? (
                    <div className="rj-empty">No applicants for this job yet.</div>
                  ) : (
                    <div className="rj-applicant-list">
                      {applicants.map((app) => (
                        <div key={app.application_id} className="rj-applicant-card">
                          <div className="rj-applicant-card__top">
                            <div>
                              <h4>{app.memberName}</h4>
                              <p>{app.headline}</p>
                              <p>{app.location}</p>
                              <p>Applied {new Date(app.application_datetime).toLocaleDateString()}</p>
                            </div>
                            <span className={`rj-status rj-status--${app.displayStatus}`}>{app.displayStatus}</span>
                          </div>
                          <div className="rj-skill-row">
                            {app.skills.length ? app.skills.map((s) => <span key={s}>{s}</span>) : <span>No skills listed</span>}
                          </div>
                          <div className="rj-applicant-card__actions">
                            <button
                              type="button"
                              className="rj-applicant-card__btn--primary"
                              onClick={() => setResumeViewer(app)}
                              disabled={!applicantHasResumeContent(app)}
                              title={
                                applicantHasResumeContent(app)
                                  ? 'View resume and cover letter'
                                  : 'No resume, PDF, or cover letter on file'
                              }
                            >
                              View resume
                            </button>
                            <button type="button" onClick={() => onNavigateProfile?.(app.member_id)}>View Profile</button>
                            <button type="button" onClick={() => handleApplicantStatus(app, 'shortlisted')}>Shortlist</button>
                            <button type="button" onClick={() => handleApplicantStatus(app, 'rejected')}>Reject</button>
                            <button type="button" onClick={() => alert('Use Messaging tab to contact this applicant.')}>Message</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'analytics' && (
                <div className="rj-tab-content">
                  {loadingAnalytics ? (
                    <div className="rj-empty">Loading analytics...</div>
                  ) : (
                    <>
                      <div className="rj-stat-grid">
                        <AnalyticsCard label="Views" value={totalViews} />
                        <AnalyticsCard label="Unique viewers (mock)" value={uniqueViewers} />
                        <AnalyticsCard label="Applicants" value={totalApplicants} />
                        <AnalyticsCard label="Conversion rate" value={`${conversionRate.toFixed(1)}%`} />
                        <AnalyticsCard label="Shortlisted" value={statusBreakdown.shortlisted} />
                        <AnalyticsCard label="Rejected" value={statusBreakdown.rejected} />
                        <AnalyticsCard label="New" value={statusBreakdown.new} />
                        <AnalyticsCard label="Reviewed" value={statusBreakdown.reviewed} />
                      </div>

                      <section className="rj-section">
                        <h4>Applicant status breakdown</h4>
                        {(['new', 'reviewed', 'shortlisted', 'rejected'] as RecruiterApplicantStatus[]).map((k) => {
                          const count = statusBreakdown[k]
                          const pct = totalApplicants > 0 ? (count / totalApplicants) * 100 : 0
                          return (
                            <div className="rj-breakdown-row" key={k}>
                              <div className="rj-breakdown-row__label">{k}</div>
                              <div className="rj-breakdown-row__bar"><span style={{ width: `${pct}%` }} /></div>
                              <div className="rj-breakdown-row__value">{count}</div>
                            </div>
                          )
                        })}
                      </section>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {resumeViewer && (
        <div className="modal-overlay rj-resume-overlay" onClick={() => setResumeViewer(null)}>
          <div
            className="modal-content rj-resume-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="rj-resume-modal-title"
            aria-modal="true"
          >
            <button type="button" className="modal-close" onClick={() => setResumeViewer(null)} aria-label="Close">
              ×
            </button>
            <h3 id="rj-resume-modal-title" className="rj-resume-modal__title">
              Resume — {resumeViewer.memberName}
            </h3>
            <p className="rj-resume-modal__meta">
              Applied {new Date(resumeViewer.application_datetime).toLocaleString()}
              {' · '}
              Status: {resumeViewer.status}
            </p>

            <div className="rj-resume-modal__links">
              {resumeViewer.resume_pdf_url?.startsWith('data:application/pdf') ? (
                <a
                  className="rj-resume-modal__link"
                  href={resumeViewer.resume_pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open PDF ({resumeViewer.resume_filename || 'resume.pdf'})
                </a>
              ) : null}
              {resumeViewer.resume_url &&
              resumeViewer.resume_url.startsWith('http') &&
              !resumeViewer.resume_url.startsWith('data:') ? (
                <a
                  className="rj-resume-modal__link"
                  href={resumeViewer.resume_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open resume link
                </a>
              ) : null}
            </div>

            {resumeViewer.cover_letter?.trim() ? (
              <section className="rj-resume-section">
                <h4 className="rj-resume-section__label">Cover letter</h4>
                <div className="rj-resume-section__body">{resumeViewer.cover_letter.trim()}</div>
              </section>
            ) : null}

            <section className="rj-resume-section">
              <h4 className="rj-resume-section__label">Resume text</h4>
              {resumeViewer.resume_text?.trim() ? (
                <pre className="rj-resume-pre">{resumeViewer.resume_text.trim()}</pre>
              ) : (
                <p className="rj-resume-empty">No extracted resume text on file. Use “Open PDF” above if available.</p>
              )}
            </section>
          </div>
        </div>
      )}

      {showPostModal && (
        <div className="modal-overlay" onClick={closePostModal}>
          <div className="modal-content rj-post-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close" onClick={closePostModal} aria-label="Close">×</button>
            <h3 className="rj-post-modal__title">Post a Job</h3>
            <p className="rj-post-modal__sub">Create a new job posting for your company.</p>

            <div className="rj-post-form">
              <label>
                Company
                <input
                  value={recruiterCompanyName || (recruiterCompanyId ? `Company #${recruiterCompanyId}` : 'Company not set in recruiter profile')}
                  disabled
                />
              </label>
              <label>
                Job Title *
                <input value={postForm.title} onChange={(e) => setPostForm((f) => ({ ...f, title: e.target.value }))} />
              </label>
              <label>
                Location
                <input value={postForm.location} onChange={(e) => setPostForm((f) => ({ ...f, location: e.target.value }))} />
              </label>
              <div className="rj-post-form__row">
                <label>
                  Work Mode
                  <select value={postForm.work_mode} onChange={(e) => setPostForm((f) => ({ ...f, work_mode: e.target.value }))}>
                    <option value="onsite">On-site</option>
                    <option value="hybrid">Hybrid</option>
                    <option value="remote">Remote</option>
                  </select>
                </label>
                <label>
                  Employment Type
                  <select value={postForm.employment_type} onChange={(e) => setPostForm((f) => ({ ...f, employment_type: e.target.value }))}>
                    <option value="Full-time">Full-time</option>
                    <option value="Internship">Internship</option>
                    <option value="Contract">Contract</option>
                    <option value="Part-time">Part-time</option>
                  </select>
                </label>
              </div>
              <div className="rj-post-form__row">
                <label>
                  Seniority
                  <select value={postForm.seniority_level} onChange={(e) => setPostForm((f) => ({ ...f, seniority_level: e.target.value }))}>
                    <option value="Entry">Entry</option>
                    <option value="Mid">Mid</option>
                    <option value="Senior">Senior</option>
                    <option value="Director">Director</option>
                  </select>
                </label>
                <label>
                  Min Salary
                  <input type="number" min={0} value={postForm.salary_min} onChange={(e) => setPostForm((f) => ({ ...f, salary_min: e.target.value }))} />
                </label>
                <label>
                  Max Salary
                  <input type="number" min={0} value={postForm.salary_max} onChange={(e) => setPostForm((f) => ({ ...f, salary_max: e.target.value }))} />
                </label>
              </div>
              <label>
                Skills (comma separated)
                <input value={postForm.skills_csv} onChange={(e) => setPostForm((f) => ({ ...f, skills_csv: e.target.value }))} placeholder="React, TypeScript, SQL" />
              </label>
              <label>
                Description
                <textarea rows={6} value={postForm.description} onChange={(e) => setPostForm((f) => ({ ...f, description: e.target.value }))} />
              </label>
            </div>

            {postError && <p className="rj-post-modal__error">{postError}</p>}
            <div className="rj-post-modal__actions">
              <button type="button" className="rj-post-modal__btn-secondary" onClick={resetPostForm} disabled={posting}>Reset</button>
              <button type="button" className="rj-post-modal__btn-secondary" onClick={closePostModal} disabled={posting}>Cancel</button>
              <button type="button" className="rj-post-modal__btn-primary" onClick={submitPostJob} disabled={posting}>
                {posting ? 'Posting...' : 'Post Job'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
