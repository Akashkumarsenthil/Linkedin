/**
 * RecruiterJobCharts — three chart cards:
 *   1. Top 10 jobs by applications per month
 *   2. Top 5 jobs with fewest applications
 *   3. Clicks per job posting (MongoDB events)
 */
import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { apiPost } from '../api'

interface JobRow {
  job_id: number
  title: string
  location?: string
  count?: number
  clicks?: number
  month?: string
}

interface ApiResp {
  success: boolean
  message: string
  data: JobRow[]
}

function shortTitle(t: string, max = 22): string {
  return t.length > max ? t.slice(0, max) + '…' : t
}

function ChartSkeleton({ bars = 5 }: { bars?: number }) {
  return (
    <div className="ad-chart-skeleton">
      {Array.from({ length: bars }).map((_, i) => (
        <div key={i} className="ad-skeleton-bar" style={{ width: `${40 + Math.random() * 50}%`, animationDelay: `${i * 0.08}s` }} />
      ))}
    </div>
  )
}

// ── Top 10 by applications per month ──

export function TopMonthlyChart() {
  const [data, setData]       = useState<JobRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const r = await apiPost<ApiResp>('/analytics/jobs/top-monthly', {
          metric: 'applications', limit: 10, window_days: 180,
        })
        if (!r.success) throw new Error(r.message)
        setData(r.data ?? [])
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Request failed')
      } finally { setLoading(false) }
    })()
  }, [])

  const chartData = data.map(d => ({ ...d, label: `${d.month} — ${shortTitle(d.title)}` }))
  const totalApps = data.reduce((s, d) => s + (d.count ?? 0), 0)

  return (
    <div className="ad-card">
      <h3 className="ad-card-title">Top 10 Jobs by Applications (Monthly)</h3>
      {loading ? <ChartSkeleton bars={8} /> : err ? <p className="ad-error">{err}</p> : data.length === 0 ? (
        <p className="ad-empty">No application data found.</p>
      ) : (
        <>
          <div className="ad-kpi-row">
            <div className="ad-kpi"><span className="ad-kpi-value">{totalApps.toLocaleString()}</span><span className="ad-kpi-label">Total</span></div>
            <div className="ad-kpi"><span className="ad-kpi-value">{data.length}</span><span className="ad-kpi-label">Jobs</span></div>
          </div>
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 28, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,.06)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" width={200} tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#0a66c2" radius={[0, 4, 4, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  )
}

// ── Bottom 5 with fewest applications ──

export function LeastAppliedChart() {
  const [data, setData]       = useState<JobRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const r = await apiPost<ApiResp>('/analytics/jobs/least-applied', {
          limit: 5, window_days: 180,
        })
        if (!r.success) throw new Error(r.message)
        setData(r.data ?? [])
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Request failed')
      } finally { setLoading(false) }
    })()
  }, [])

  const chartData = data.map(d => ({ ...d, label: shortTitle(d.title) }))

  return (
    <div className="ad-card">
      <h3 className="ad-card-title">Bottom 5 Jobs (Fewest Applications)</h3>
      {loading ? <ChartSkeleton bars={5} /> : err ? <p className="ad-error">{err}</p> : data.length === 0 ? (
        <p className="ad-empty">No open jobs found.</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 28, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,.06)" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="label" width={170} tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
            <Tooltip />
            <Bar dataKey="count" fill="#b24020" radius={[0, 4, 4, 0]} barSize={14} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// ── Clicks per job (MongoDB) ──

export function ClicksPerJobChart() {
  const [data, setData]       = useState<JobRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const r = await apiPost<ApiResp>('/analytics/jobs/clicks', {
          limit: 10, window_days: 90,
        })
        if (!r.success) throw new Error(r.message)
        setData(r.data ?? [])
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Request failed')
      } finally { setLoading(false) }
    })()
  }, [])

  const chartData = data.map(d => ({ ...d, label: shortTitle(d.title), count: d.clicks ?? 0 }))
  const totalClicks = chartData.reduce((s, d) => s + d.count, 0)

  return (
    <div className="ad-card">
      <h3 className="ad-card-title">Clicks per Job</h3>
      <p className="ad-card-hint">Source: MongoDB <code>event_logs</code> · last 90 days</p>
      {loading ? <ChartSkeleton bars={6} /> : err ? <p className="ad-error">{err}</p> : data.length === 0 ? (
        <p className="ad-empty">No click events recorded yet.</p>
      ) : (
        <>
          <div className="ad-kpi-row">
            <div className="ad-kpi"><span className="ad-kpi-value">{totalClicks.toLocaleString()}</span><span className="ad-kpi-label">Total Clicks</span></div>
            <div className="ad-kpi"><span className="ad-kpi-value">{data.length > 0 ? Math.round(totalClicks / data.length) : 0}</span><span className="ad-kpi-label">Avg/Job</span></div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 28, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,.06)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" width={170} tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#378fe9" radius={[0, 4, 4, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  )
}
