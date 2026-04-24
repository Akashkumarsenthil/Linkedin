import { useState } from 'react'
import { apiPost } from '../api'

interface GeoRow {
  city: string
  state: string
  count: number
}

interface ApiResp {
  success: boolean
  message: string
  data: GeoRow[]
}

export function GeoTable() {
  const [jobId, setJobId]     = useState('1')
  const [data, setData]       = useState<GeoRow[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState<string | null>(null)
  const [loaded, setLoaded]   = useState(false)

  const load = async () => {
    const id = parseInt(jobId, 10)
    if (!id || id < 1) { setErr('Enter a valid job ID'); return }
    setLoading(true)
    setErr(null)
    try {
      const r = await apiPost<ApiResp>('/analytics/geo', {
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

  const maxCount = Math.max(...data.map(d => d.count), 1)
  const total    = data.reduce((s, d) => s + d.count, 0)

  return (
    <div className="chart-card">
      <div className="chart-header">
        <h3 className="chart-title">Applicant Geography</h3>
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
          {loading ? 'Loading…' : 'Load geo'}
        </button>
      </div>

      {err && <p className="error">{err}</p>}
      {loaded && data.length === 0 && (
        <p className="hint">No applicants found for this job.</p>
      )}

      {data.length > 0 && (
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
                  <div
                    className="geo-bar"
                    style={{ width: `${(row.count / maxCount) * 100}%` }}
                    title={`${((row.count / total) * 100).toFixed(1)}% of total`}
                  />
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
      )}
    </div>
  )
}
