import type { JobPosting } from './JobsPage'
import { JobCard } from './JobCard'

interface JobListProps {
  jobs: JobPosting[]
  selectedId: number | null
  appliedJobIds: Set<number>
  savedJobIds: Set<number>
  onSelect: (id: number) => void
  onDismiss: (id: number) => void
}

export function JobList({ jobs, selectedId, appliedJobIds, savedJobIds, onSelect, onDismiss }: JobListProps) {
  return (
    <div className="jobs-list-panel">
      <div className="jobs-list-panel__header">
        <h2 className="jobs-list-panel__title">Top job picks for you</h2>
        <p className="jobs-list-panel__subtitle">
          Based on your profile, preferences, and activity like applies, searches, and saves
        </p>
        <p className="jobs-list-panel__count">{jobs.length} results</p>
      </div>

      <ul className="jobs-list-panel__list" role="list">
        {jobs.map((job) => (
          <JobCard
            key={job.job_id}
            job={job}
            isSelected={selectedId === job.job_id}
            isApplied={appliedJobIds.has(job.job_id)}
            isSaved={savedJobIds.has(job.job_id)}
            onClick={() => onSelect(job.job_id)}
            onDismiss={() => onDismiss(job.job_id)}
          />
        ))}
      </ul>
    </div>
  )
}
