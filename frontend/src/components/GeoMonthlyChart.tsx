/**
 * GeoMonthlyChart — city-wise applications per month for a selected job.
 */
import { useState, useEffect } from 'react'
import { apiPost, parseStoredUser } from '../api'

interface GeoMonthRow { month: string; city: string; state: string; count: number }
interface ApiResp { success: boolean; message: string; data: GeoMonthRow[] }
interface JobOption { job_id: number; title: string }

export function GeoMonthlyChart() {
  const [jobs, setJobs]       = useState<JobOption[]>([])
  const [jobId, setJobId]     = useState<number | null>(null)
  const [data, setData]       = useState<GeoMonthRow[]>([])
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
        const r = await apiPost<ApiResp>('/analytics/geo/monthly', { job_id: jobId, window_days: 365 })
        if (!r.success) throw new Error(r.message)
        setData(r.data ?? [])
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Request failed')
      } finally { setLoading(false) }
    }
    void load()
  }, [jobId])

  const months = [...new Set(data.map(d => d.month))].sort()
  const total  = data.reduce((s, d) => s + d.count, 0)

  return (
    <div className="ad-card">
      <h3 className="ad-card-title">City Applications by Month</h3>

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
          {[1,2,3].map(i => <div key={i} className="ad-skeleton-bar" style={{ width: `${80 - i*15}%` }} />)}
        </div>
      ) : data.length === 0 ? (
        <p className="ad-empty">No application data for this job.</p>
      ) : (
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          {months.map(month => {
            const rows = data.filter(d => d.month === month)
            const monthTotal = rows.reduce((s, r) => s + r.count, 0)
            return (
              <div key={month} style={{ marginBottom: '0.75rem' }}>
                <p style={{ fontWeight: 600, fontSize: '0.85rem', margin: '0 0 0.25rem' }}>
                  {month}
                  <span className="muted" style={{ fontWeight: 400, marginLeft: 8 }}>
                    ({monthTotal} total)
                  </span>
                </p>
                <table className="geo-table" style={{ marginBottom: 0 }}>
                  <thead>
                    <tr>
                      <th>City</th>
                      <th>State</th>
                      <th className="geo-count-col">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={`${month}-${row.city}-${row.state}`}>
                        <td>{row.city}</td>
                        <td className="muted">{row.state}</td>
                        <td className="geo-count-col">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
          <p className="muted" style={{ fontSize: '0.8rem' }}>
            {months.length} month(s), {total} total applications
          </p>
        </div>
      )}
    </div>
  )
}
