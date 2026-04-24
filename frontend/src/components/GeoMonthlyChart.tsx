/**
 * GeoMonthlyChart — city-wise applications per month for a selected job.
 * Brief requirement: "City-wise applications per month for a selected job posting."
 * Endpoint: POST /analytics/geo/monthly
 * Data source: MySQL applications + members (JOIN + GROUP BY month, city).
 */
import { useState } from 'react'
import { apiPost } from '../api'

interface GeoMonthRow {
  month: string
  city: string
  state: string
  count: number
}

interface ApiResp {
  success: boolean
  message: string
  data: GeoMonthRow[]
}

export function GeoMonthlyChart() {
  const [jobId, setJobId]     = useState('1')
  const [data, setData]       = useState<GeoMonthRow[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState<string | null>(null)
  const [loaded, setLoaded]   = useState(false)

  const load = async () => {
    const id = parseInt(jobId, 10)
    if (!id || id < 1) { setErr('Enter a valid job ID'); return }
    setLoading(true)
    setErr(null)
    try {
      const r = await apiPost<ApiResp>('/analytics/geo/monthly', {
        job_id: id,
        window_days: 365,
      })
      if (!r.success) throw new Error(r.message)
      setData(r.data ?? [])
      setLoaded(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  // Group data by month for display
  const months = [...new Set(data.map(d => d.month))].sort()
  const total  = data.reduce((s, d) => s + d.count, 0)

  return (
    <div className="chart-card">
      <div className="chart-header">
        <h3 className="chart-title">City Applications by Month</h3>
      </div>

      <div className="row">
        <label>
          Job ID
          <input
            type="number"
            value={jobId}
            min={1}
            onChange={e => setJobId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()}
            style={{ width: 80 }}
          />
        </label>
        <button type="button" className="primary" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Load'}
        </button>
      </div>

      {err && <p className="error">{err}</p>}
      {loaded && data.length === 0 && (
        <p className="hint">No application data for this job.</p>
      )}

      {data.length > 0 && (
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
