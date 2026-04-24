/**
 * RecruiterJobCharts — three recruiter-dashboard cards in one component:
 *   1. Top 10 jobs by applications per month
 *   2. Top 5 jobs with fewest applications
 *   3. Clicks per job posting (from MongoDB event logs)
 */
import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
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

// ── Top 10 by applications per month ──────────────────────────────────

export function TopMonthlyChart() {
  const [data, setData]       = useState<JobRow[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState<string | null>(null)
  const [loaded, setLoaded]   = useState(false)

  const load = async () => {
    setLoading(true)
    setErr(null)
    try {
      const r = await apiPost<ApiResp>('/analytics/jobs/top-monthly', {
        metric: 'applications',
        limit: 10,
        window_days: 180,
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

  const chartData = data.map(d => ({
    ...d,
    label: `${d.month} — ${shortTitle(d.title)}`,
  }))

  return (
    <div className="chart-card">
      <div className="chart-header">
        <h3 className="chart-title">Top 10 Jobs by Applications (Monthly)</h3>
      </div>
      {!loaded && (
        <button type="button" className="primary" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Load chart'}
        </button>
      )}
      {err && <p className="error">{err}</p>}
      {loaded && data.length === 0 && (
        <p className="hint">No application data found.</p>
      )}
      {loaded && data.length > 0 && (
        <ResponsiveContainer width="100%" height={320}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ left: 8, right: 28, top: 4, bottom: 4 }}
          >
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="label" width={200} tick={{ fontSize: 10 }} />
            <Tooltip
              formatter={(val) => [val, 'applications']}
              labelFormatter={(label) => {
                const s = String(label)
                const match = data.find(d => `${d.month} — ${shortTitle(d.title)}` === s)
                return match ? `${match.month}: ${match.title}` : s
              }}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {chartData.map(entry => (
                <Cell key={`${entry.job_id}-${entry.month}`} fill="#0a66c2" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// ── Top 5 with fewest applications ────────────────────────────────────

export function LeastAppliedChart() {
  const [data, setData]       = useState<JobRow[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState<string | null>(null)
  const [loaded, setLoaded]   = useState(false)

  const load = async () => {
    setLoading(true)
    setErr(null)
    try {
      const r = await apiPost<ApiResp>('/analytics/jobs/least-applied', {
        limit: 5,
        window_days: 180,
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

  const chartData = data.map(d => ({
    ...d,
    label: shortTitle(d.title),
  }))

  return (
    <div className="chart-card">
      <div className="chart-header">
        <h3 className="chart-title">Bottom 5 Jobs (Fewest Applications)</h3>
      </div>
      {!loaded && (
        <button type="button" className="primary" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Load chart'}
        </button>
      )}
      {err && <p className="error">{err}</p>}
      {loaded && data.length === 0 && (
        <p className="hint">No open jobs found.</p>
      )}
      {loaded && data.length > 0 && (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ left: 8, right: 28, top: 4, bottom: 4 }}
          >
            <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
            <YAxis type="category" dataKey="label" width={170} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(val) => [val, 'applications']}
              labelFormatter={(label) => {
                const s = String(label)
                const match = data.find(d => shortTitle(d.title) === s)
                return match?.title ?? s
              }}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {chartData.map(entry => (
                <Cell key={entry.job_id} fill="#b24020" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// ── Clicks per job (from MongoDB event logs) ──────────────────────────

export function ClicksPerJobChart() {
  const [data, setData]       = useState<JobRow[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState<string | null>(null)
  const [loaded, setLoaded]   = useState(false)

  const load = async () => {
    setLoading(true)
    setErr(null)
    try {
      const r = await apiPost<ApiResp>('/analytics/jobs/clicks', {
        limit: 10,
        window_days: 90,
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

  const chartData = data.map(d => ({
    ...d,
    label: shortTitle(d.title),
    count: d.clicks ?? 0,
  }))

  return (
    <div className="chart-card">
      <div className="chart-header">
        <h3 className="chart-title">Clicks per Job (Event Logs)</h3>
      </div>
      <p className="hint" style={{ margin: 0 }}>
        Source: MongoDB <code>event_logs</code> collection (<code>job.viewed</code> events)
      </p>
      {!loaded && (
        <button type="button" className="primary" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Load chart'}
        </button>
      )}
      {err && <p className="error">{err}</p>}
      {loaded && data.length === 0 && (
        <p className="hint">No click events recorded yet. View some jobs to generate events.</p>
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
              formatter={(val) => [val, 'clicks']}
              labelFormatter={(label) => {
                const s = String(label)
                const match = data.find(d => shortTitle(d.title) === s)
                return match?.title ?? s
              }}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {chartData.map(entry => (
                <Cell key={entry.job_id} fill="#378fe9" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
