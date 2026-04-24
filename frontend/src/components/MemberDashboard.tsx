import { useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { apiPost } from '../api'

interface ViewDay {
  date: string
  views: number
}

interface DashboardData {
  member_id: number
  name: string
  total_connections: number
  profile_views_30d: ViewDay[]
  total_views_30d: number
  application_status_breakdown: Record<string, number>
  total_applications: number
}

interface ApiResp {
  success: boolean
  message: string
  data: DashboardData
}

const STATUS_COLORS: Record<string, string> = {
  submitted: '#378fe9',
  reviewing: '#f5a623',
  interview: '#0a66c2',
  offer:     '#28a745',
  rejected:  '#b24020',
}
const FALLBACK_COLORS = ['#5fa8e8', '#8a9bb0', '#6c757d', '#adb5bd']

function statusColor(name: string, idx: number): string {
  return STATUS_COLORS[name] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length]
}

export function MemberDashboard() {
  const [memberId, setMemberId] = useState('1')
  const [data, setData]         = useState<DashboardData | null>(null)
  const [loading, setLoading]   = useState(false)
  const [err, setErr]           = useState<string | null>(null)

  const load = async () => {
    const id = parseInt(memberId, 10)
    if (!id || id < 1) { setErr('Enter a valid member ID'); return }
    setLoading(true)
    setErr(null)
    try {
      const r = await apiPost<ApiResp>('/analytics/member/dashboard', {
        member_id: id,
      })
      if (!r.success) throw new Error(r.message)
      setData(r.data)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  const pieData = data
    ? Object.entries(data.application_status_breakdown).map(([name, value]) => ({
        name, value,
      }))
    : []

  // Format "MM-DD" for the X axis tick (drop the year)
  const fmtDate = (d: string) => d.slice(5)

  return (
    <div className="chart-card">
      <div className="chart-header">
        <h3 className="chart-title">Member Dashboard</h3>
      </div>

      <div className="row">
        <label>
          Member ID
          <input
            type="number"
            value={memberId}
            min={1}
            onChange={e => setMemberId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()}
            style={{ width: 90 }}
          />
        </label>
        <button type="button" className="primary" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Load dashboard'}
        </button>
      </div>

      {err && <p className="error">{err}</p>}

      {data && (
        <>
          {/* ── Summary pills ──────────────────────────────────── */}
          <div className="member-summary">
            <span className="member-name">{data.name}</span>
            <span className="pill">{data.total_connections} connections</span>
            <span className="pill">{data.total_views_30d} profile views (30 d)</span>
            <span className="pill">{data.total_applications} applications</span>
          </div>

          {/* ── Profile views line chart ───────────────────────── */}
          {data.profile_views_30d.length > 0 ? (
            <>
              <p className="chart-label">Profile views — last 30 days</p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart
                  data={data.profile_views_30d}
                  margin={{ top: 4, right: 16, bottom: 4, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8edf2" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={fmtDate}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={32} />
                  <Tooltip
                    labelFormatter={d => `Date: ${d}`}
                    formatter={(val) => [val, 'views']}
                  />
                  <Line
                    type="monotone"
                    dataKey="views"
                    stroke="#0a66c2"
                    strokeWidth={2}
                    dot={data.profile_views_30d.length < 15}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </>
          ) : (
            <p className="hint" style={{ marginTop: '0.75rem' }}>
              No profile view data in the last 30 days.
            </p>
          )}

          {/* ── Application status pie chart ───────────────────── */}
          {pieData.length > 0 ? (
            <>
              <p className="chart-label">Application status breakdown</p>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    outerRadius={75}
                    dataKey="value"
                    label={({ name, percent }) =>
                      `${name} ${percent !== undefined ? (percent * 100).toFixed(0) : 0}%`
                    }
                  >
                    {pieData.map((entry, idx) => (
                      <Cell key={entry.name} fill={statusColor(entry.name, idx)} />
                    ))}
                  </Pie>
                  <Legend iconSize={10} />
                  <Tooltip formatter={(val) => [val, 'applications']} />
                </PieChart>
              </ResponsiveContainer>
            </>
          ) : (
            <p className="hint" style={{ marginTop: '0.75rem' }}>
              No applications found for this member.
            </p>
          )}
        </>
      )}
    </div>
  )
}
