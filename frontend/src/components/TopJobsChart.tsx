import { useState, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { apiPost } from '../api'

type Metric = 'applications' | 'views' | 'saves'

interface TopJob {
  job_id: number
  title: string
  location: string
  count: number
}

interface ApiResp {
  success: boolean
  message: string
  data: TopJob[]
}

// Shorten long titles to fit Y-axis label width
function shortTitle(t: string, max = 24): string {
  return t.length > max ? t.slice(0, max) + '…' : t
}

const METRIC_COLOR: Record<Metric, string> = {
  applications: '#0a66c2',
  views:        '#378fe9',
  saves:        '#5fa8e8',
}

export function TopJobsChart() {
  const [metric, setMetric]   = useState<Metric>('applications')
  const [data, setData]       = useState<TopJob[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState<string | null>(null)
  const [loaded, setLoaded]   = useState(false)

  const load = useCallback(async (m: Metric) => {
    setLoading(true)
    setErr(null)
    try {
      const r = await apiPost<ApiResp>('/analytics/jobs/top', {
        metric: m,
        limit: 8,
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
  }, [])

  const switchMetric = (m: Metric) => {
    setMetric(m)
    load(m)
  }

  const chartData = data.map(d => ({
    ...d,
    label: shortTitle(d.title),
  }))

  return (
    <div className="chart-card">
      <div className="chart-header">
        <h3 className="chart-title">Top Jobs</h3>
        <div className="metric-tabs">
          {(['applications', 'views', 'saves'] as Metric[]).map(m => (
            <button
              key={m}
              type="button"
              className={metric === m && loaded ? 'metric-btn active' : 'metric-btn'}
              onClick={() => switchMetric(m)}
              disabled={loading}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {!loaded && (
        <button type="button" className="primary" onClick={() => load(metric)} disabled={loading}>
          {loading ? 'Loading…' : 'Load chart'}
        </button>
      )}
      {err && <p className="error">{err}</p>}
      {loaded && data.length === 0 && (
        <p className="hint">No data — run <code>seed_data.py</code> first.</p>
      )}

      {loaded && data.length > 0 && (
        <ResponsiveContainer width="100%" height={270}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ left: 8, right: 28, top: 4, bottom: 4 }}
          >
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="label" width={170} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(val) => [val, metric]}
              labelFormatter={(label) => {
                const s = String(label)
                const full = data.find(d => shortTitle(d.title) === s)
                return full?.title ?? s
              }}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {chartData.map(entry => (
                <Cell key={entry.job_id} fill={METRIC_COLOR[metric]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
