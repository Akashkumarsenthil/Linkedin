import { useState, useEffect } from 'react'
import { apiPost, parseStoredUser } from '../api'

interface GeoRow { city: string; state: string; count: number }
interface ApiResp { success: boolean; message: string; data: GeoRow[] }
interface JobOption { job_id: number; title: string }

export function GeoTable() {
  const [jobs, setJobs]       = useState<JobOption[]>([])
  const [jobId, setJobId]     = useState<number | null>(null)
  const [data, setData]       = useState<GeoRow[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState<string | null>(null)

  useEffect(() => {
    const user = parseStoredUser()
    if (!user) return
    apiPost<{ success: boolean; data: JobOption[] }>('/jobs/byRecruiter', {
      recruiter_id: user.user_id,
      page_size: 100,
    }).then(res => {
      const list = res.data ?? []
      setJobs(list)
      if (list.length > 0) setJobId(list[0].job_id)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (jobId == null) return
    const load = async () => {
      setLoading(true); setErr(null)
      try {
        const r = await apiPost<ApiResp>('/analytics/geo', { job_id: jobId, window_days: 365 })
        if (!r.success) throw new Error(r.message)
        setData(r.data ?? [])
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Request failed')
      } finally { setLoading(false) }
    }
    void load()
  }, [jobId])

  const maxCount = Math.max(...data.map(d => d.count), 1)
  const total    = data.reduce((s, d) => s + d.count, 0)

  return (
    <div className="ad-card">
      <h3 className="ad-card-title">Applicant Geography</h3>

      <div className="ad-form-row">
        <select
          className="ad-input"
          value={jobId ?? ''}
          onChange={e => setJobId(Number(e.target.value))}
          disabled={jobs.length === 0}
        >
          {jobs.length === 0 && <option value="">No jobs found</option>}
          {jobs.map(j => (
            <option key={j.job_id} value={j.job_id}>{j.title} (#{j.job_id})</option>
          ))}
        </select>
      </div>

      {err && <p className="ad-error">{err}</p>}

      {loading && data.length === 0 ? (
        <div className="ad-chart-skeleton">
          {[1,2,3,4].map(i => <div key={i} className="ad-skeleton-bar" style={{ width: `${80 - i*12}%` }} />)}
        </div>
      ) : data.length === 0 ? (
        <p className="ad-empty">No applicants found for this job.</p>
      ) : (
        <>
          <table className="geo-table">
            <thead>
              <tr>
                <th>City</th>
                <th>State</th>
                <th className="geo-count-col">Count</th>
                <th className="geo-bar-col" />
              </tr>
            </thead>
            <tbody>
              {data.map(row => (
                <tr key={`${row.city}-${row.state}`}>
                  <td>{row.city}</td>
                  <td className="muted">{row.state}</td>
                  <td className="geo-count-col">{row.count}</td>
                  <td className="geo-bar-col">
                    <div className="geo-bar" style={{ width: `${(row.count / maxCount) * 100}%` }}
                      title={`${((row.count / total) * 100).toFixed(1)}% of total`} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} className="muted" style={{ fontSize: '0.8rem' }}>
                  {data.length} location{data.length !== 1 ? 's' : ''}
                </td>
                <td className="geo-count-col" style={{ fontWeight: 600 }}>{total}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </>
      )}
    </div>
  )
}
