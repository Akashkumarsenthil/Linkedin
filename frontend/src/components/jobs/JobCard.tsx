import type { JobPosting } from './JobsPage'

interface JobCardProps {
  job: JobPosting
  isSelected: boolean
  isApplied: boolean
  onClick: () => void
  onDismiss: () => void
  readOnly?: boolean
}

export function JobCard({ job, isSelected, isApplied, onClick, onDismiss, readOnly = false }: JobCardProps) {
  // Mock company name/logo based on company_id
  const companyName = job.company_name || `Company #${job.company_id || 'Unknown'}`
  const companyLogo = companyName.charAt(0)
  
  const dateStr = new Date(job.posted_datetime).toLocaleDateString()
  const salaryStr = job.salary_min && job.salary_max ? `$${job.salary_min.toLocaleString()} - $${job.salary_max.toLocaleString()}/yr` : ''

  return (
    <li
      className={`jobs-li-card${isSelected ? ' jobs-li-card--active' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick() }}
    >
      {/* Company logo */}
      <div className="jobs-li-card__logo">
        <span>{companyLogo}</span>
      </div>

      {/* Card body */}
      <div className="jobs-li-card__body">
        <h3 className="jobs-li-card__title">{job.title}</h3>
        <p className="jobs-li-card__company">{companyName}</p>
        <p className="jobs-li-card__location">
          {job.location} ({job.work_mode})
        </p>
        {isApplied && <p className="jobs-li-card__alumni" style={{ color: 'var(--success)', fontWeight: 600 }}>✓ Applied</p>}
        {salaryStr && <p className="jobs-li-card__alumni">{salaryStr}</p>}
        <p className="jobs-li-card__posted">
          {dateStr}
        </p>
      </div>

      {/* Close / dismiss button — hidden for read-only viewers (e.g. admin) */}
      {!readOnly && (
        <button
          type="button"
          className="jobs-li-card__close"
          title="Dismiss"
          onClick={(e) => {
            e.stopPropagation()
            onDismiss()
          }}
          aria-label={`Dismiss ${job.title}`}
        >
          ✕
        </button>
      )}
    </li>
  )
}
