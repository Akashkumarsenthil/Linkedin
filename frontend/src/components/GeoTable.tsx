import { useState, useEffect } from 'react'
import { apiPost } from '../api'

interface GeoRow { city: string; state: string; count: number }
interface ApiResp { success: boolean; message: string; data: GeoRow[] }

export function GeoTable() {
  const [jobId, setJobId]     = useState('1')
  const [data, setData]       = useState<GeoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState<string | null>(null)

  const load = async (id?: string) => {
    const numId = parseInt(id ?? jobId, 10)
    if (!numId || numId < 1) { setErr('Enter a valid job ID'); return }
    setLoading(true); setErr(null)
    try {
      const r = await apiPost<ApiResp>('/analytics/geo', { job_id: numId, window_days: 365 })
      if (!r.success) throw new Error(r.message)
      setData(r.data ?? [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed')
    } finally { setLoading(false) }
  }

  useEffect(() => { load('1') }, [])

  const maxCount = Math.max(...data.map(d => d.count), 1)
  const total    = data.reduce((s, d) => s + d.count, 0)

  return (
    <div className="ad-card">
      <h3 className="ad-card-title">Applicant Geography</h3>

      <div className="ad-form-row">
        <input className="ad-input" type="number" value={jobId} min={1} placeholder="Job ID"
          onChange={e => setJobId(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load()} />
        <button type="button" className="ad-btn" onClick={() => load()} disabled={loading}>
          {loading ? '...' : 'Go'}
        </button>
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
