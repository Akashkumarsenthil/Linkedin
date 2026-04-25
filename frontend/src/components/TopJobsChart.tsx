import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid,
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
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState<string | null>(null)

  const load = useCallback(async (m: Metric) => {
    setLoading(true)
    setErr(null)
    try {
      const r = await apiPost<ApiResp>('/analytics/jobs/top', {
        metric: m, limit: 8, window_days: 365,
      })
      if (!r.success) throw new Error(r.message)
      setData(r.data ?? [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load('applications') }, [load])

  const switchMetric = (m: Metric) => { setMetric(m); load(m) }

  const chartData = data.map(d => ({ ...d, label: shortTitle(d.title) }))
  const total = data.reduce((s, d) => s + d.count, 0)

  return (
    <div className="ad-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h3 className="ad-card-title">Top Jobs</h3>
        <div className="ad-metric-tabs">
          {(['applications', 'views', 'saves'] as Metric[]).map(m => (
            <button
              key={m} type="button"
              className={`ad-metric-tab${metric === m ? ' active' : ''}`}
              onClick={() => switchMetric(m)} disabled={loading}
            >{m}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="ad-chart-skeleton">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="ad-skeleton-bar" style={{ width: `${40 + Math.random() * 50}%`, animationDelay: `${i * 0.08}s` }} />
          ))}
        </div>
      ) : err ? <p className="ad-error">{err}</p> : data.length === 0 ? (
        <p className="ad-empty">No data — run <code>seed_data.py</code> first.</p>
      ) : (
        <>
          <div className="ad-kpi-row">
            <div className="ad-kpi"><span className="ad-kpi-value">{total.toLocaleString()}</span><span className="ad-kpi-label">Total {metric}</span></div>
            <div className="ad-kpi"><span className="ad-kpi-value">{data.length > 0 ? Math.round(total / data.length) : 0}</span><span className="ad-kpi-label">Avg/Job</span></div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 28, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,.06)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" width={170} tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Bar dataKey="count" fill={METRIC_COLOR[metric]} radius={[0, 4, 4, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  )
}
