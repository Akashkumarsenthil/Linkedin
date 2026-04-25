/**
 * GeoMonthlyChart — city-wise applications per month for a selected job.
 */
import { useState, useEffect } from 'react'
import { apiPost } from '../api'

interface GeoMonthRow { month: string; city: string; state: string; count: number }
interface ApiResp { success: boolean; message: string; data: GeoMonthRow[] }

export function GeoMonthlyChart() {
  const [jobId, setJobId]     = useState('1')
  const [data, setData]       = useState<GeoMonthRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState<string | null>(null)

  const load = async (id?: string) => {
    const numId = parseInt(id ?? jobId, 10)
    if (!numId || numId < 1) { setErr('Enter a valid job ID'); return }
    setLoading(true); setErr(null)
    try {
      const r = await apiPost<ApiResp>('/analytics/geo/monthly', { job_id: numId, window_days: 365 })
      if (!r.success) throw new Error(r.message)
      setData(r.data ?? [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed')
    } finally { setLoading(false) }
  }

  useEffect(() => { load('1') }, [])

  const months = [...new Set(data.map(d => d.month))].sort()
  const total  = data.reduce((s, d) => s + d.count, 0)

  return (
    <div className="ad-card">
      <h3 className="ad-card-title">City Applications by Month</h3>

      <div className="ad-inline-controls">
        <label className="ad-inline-label">
          Job ID
          <input className="ad-inline-input" type="number" value={jobId} min={1}
            onChange={e => setJobId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()} />
        </label>
        <button type="button" className="ad-load-btn" onClick={() => load()} disabled={loading}>
          {loading ? 'Loading…' : 'Go'}
        </button>
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
