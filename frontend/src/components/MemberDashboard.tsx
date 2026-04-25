import { useState, useEffect } from 'react'
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from 'recharts'
import { apiPost } from '../api'

interface ViewDay { date: string; views: number }

interface DashboardData {
  member_id: number
  name: string
  total_connections: number
  profile_views_30d: ViewDay[]
  total_views_30d: number
  application_status_breakdown: Record<string, number>
  total_applications: number
}

interface ApiResp { success: boolean; message: string; data: DashboardData }

const STATUS_COLORS: Record<string, string> = {
  submitted: '#378fe9', reviewing: '#f5a623', interview: '#0a66c2',
  offer: '#28a745', rejected: '#b24020',
}
const FALLBACK_COLORS = ['#5fa8e8', '#8a9bb0', '#6c757d', '#adb5bd']

function statusColor(name: string, idx: number): string {
  return STATUS_COLORS[name] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length]
}

export function MemberDashboard() {
  const [memberId, setMemberId] = useState('1')
  const [data, setData]         = useState<DashboardData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [err, setErr]           = useState<string | null>(null)

  const load = async (id?: string) => {
    const numId = parseInt(id ?? memberId, 10)
    if (!numId || numId < 1) { setErr('Enter a valid member ID'); return }
    setLoading(true); setErr(null)
    try {
      const r = await apiPost<ApiResp>('/analytics/member/dashboard', { member_id: numId })
      if (!r.success) throw new Error(r.message)
      setData(r.data)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed')
    } finally { setLoading(false) }
  }

  useEffect(() => { load('1') }, [])

  const pieData = data
    ? Object.entries(data.application_status_breakdown).map(([name, value]) => ({ name, value }))
    : []

  const fmtDate = (d: string) => d.slice(5)

  return (
    <div className="ad-card">
      <h3 className="ad-card-title">Member Dashboard</h3>

      <div className="ad-inline-controls">
        <label className="ad-inline-label">
          Member ID
          <input className="ad-inline-input" type="number" value={memberId} min={1}
            onChange={e => setMemberId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()}
            style={{ width: 80 }} />
        </label>
        <button type="button" className="ad-load-btn" onClick={() => load()} disabled={loading}>
          {loading ? 'Loading…' : 'Go'}
        </button>
      </div>

      {err && <p className="ad-error">{err}</p>}

      {loading && !data ? (
        <div className="ad-chart-skeleton">
          {[1,2,3].map(i => <div key={i} className="ad-skeleton-bar" style={{ width: `${80 - i*15}%` }} />)}
        </div>
      ) : data && (
        <>
          <div className="member-summary">
            <span className="member-name">{data.name}</span>
            <span className="pill">{data.total_connections} connections</span>
            <span className="pill">{data.total_views_30d} profile views (30 d)</span>
            <span className="pill">{data.total_applications} applications</span>
          </div>

          {data.profile_views_30d.length > 0 && (
            <>
              <p className="chart-label">Profile views — last 30 days</p>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={data.profile_views_30d} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                  <defs>
                    <linearGradient id="viewsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0a66c2" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#0a66c2" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,.06)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} tickFormatter={fmtDate} interval="preserveStartEnd" axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} width={32} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Area type="monotone" dataKey="views" stroke="#0a66c2" strokeWidth={2} fill="url(#viewsFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </>
          )}

          {pieData.length > 0 && (
            <>
              <p className="chart-label">Application status breakdown</p>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={75} dataKey="value"
                    label={({ name, percent }) => `${name} ${percent !== undefined ? (percent * 100).toFixed(0) : 0}%`}
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
          )}
        </>
      )}
    </div>
  )
}
