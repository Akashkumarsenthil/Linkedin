/**
 * SavesTrendChart — saved jobs per day or week.
 * Brief requirement: "Number of saved jobs per day/week (from logs)."
 * Endpoint: POST /analytics/saves/trend
 * Data source: MySQL saved_jobs table (saved_at timestamp).
 */
import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { apiPost } from '../api'

type Granularity = 'day' | 'week'

interface TrendRow {
  period: string
  count: number
}

interface ApiResp {
  success: boolean
  message: string
  data: TrendRow[]
}

export function SavesTrendChart() {
  const [granularity, setGranularity] = useState<Granularity>('day')
  const [data, setData]               = useState<TrendRow[]>([])
  const [loading, setLoading]         = useState(false)
  const [err, setErr]                 = useState<string | null>(null)
  const [loaded, setLoaded]           = useState(false)

  const load = async (g: Granularity) => {
    setLoading(true)
    setErr(null)
    try {
      const r = await apiPost<ApiResp>('/analytics/saves/trend', {
        window_days: g === 'week' ? 90 : 30,
        granularity: g,
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

  const switchGranularity = (g: Granularity) => {
    setGranularity(g)
    load(g)
  }

  const fmtPeriod = (p: string) => {
    if (granularity === 'day') return p.slice(5)   // drop year → MM-DD
    return p                                        // week label as-is
  }

  const total = data.reduce((s, d) => s + d.count, 0)

  return (
    <div className="chart-card">
      <div className="chart-header">
        <h3 className="chart-title">Saved Jobs Trend</h3>
        <div className="metric-tabs">
          {(['day', 'week'] as Granularity[]).map(g => (
            <button
              key={g}
              type="button"
              className={granularity === g && loaded ? 'metric-btn active' : 'metric-btn'}
              onClick={() => switchGranularity(g)}
              disabled={loading}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {!loaded && (
        <button type="button" className="primary" onClick={() => load(granularity)} disabled={loading}>
          {loading ? 'Loading…' : 'Load chart'}
        </button>
      )}
      {err && <p className="error">{err}</p>}
      {loaded && data.length === 0 && (
        <p className="hint">No saved-job data in the selected window.</p>
      )}

      {loaded && data.length > 0 && (
        <>
          <p className="hint" style={{ margin: 0, fontSize: '0.8rem' }}>
            {total} saves over {data.length} {granularity === 'day' ? 'days' : 'weeks'}
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data} margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8edf2" />
              <XAxis
                dataKey="period"
                tick={{ fontSize: 10 }}
                tickFormatter={fmtPeriod}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={32} />
              <Tooltip
                labelFormatter={(l) => `${granularity === 'day' ? 'Date' : 'Week'}: ${l}`}
                formatter={(val) => [val, 'saves']}
              />
              <Bar dataKey="count" fill="#5fa8e8" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  )
}
