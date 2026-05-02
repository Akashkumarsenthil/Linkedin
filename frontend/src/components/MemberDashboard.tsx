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

  const CustomTooltipArea = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="ad-custom-tooltip">
          <div className="ad-custom-tooltip-label">{label}</div>
          <div className="ad-custom-tooltip-value"><strong>{payload[0].value}</strong> views</div>
        </div>
      );
    }
    return null;
  };

  const CustomTooltipPie = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="ad-custom-tooltip">
          <div className="ad-custom-tooltip-label">{payload[0].name}</div>
          <div className="ad-custom-tooltip-value"><strong>{payload[0].value}</strong> applications</div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="ad-card col-span-2">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h3 className="ad-card-title">Member Dashboard</h3>
        <div className="ad-form-row" style={{ marginBottom: 0 }}>
          <input className="ad-input" type="number" value={memberId} min={1} placeholder="Member ID"
            onChange={e => setMemberId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()}
            style={{ width: 100 }} />
          <button type="button" className="ad-btn" onClick={() => load()} disabled={loading}>
            {loading ? '...' : 'Go'}
          </button>
        </div>
      </div>

      {err && <p className="ad-error">{err}</p>}

      {loading && !data ? (
        <div className="ad-chart-skeleton">
          {[1,2,3].map(i => <div key={i} className="ad-skeleton-bar" style={{ width: `${80 - i*15}%` }} />)}
        </div>
      ) : data && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
            <div style={{ fontWeight: 700, fontSize: '18px', color: 'var(--text)', display: 'flex', alignItems: 'center' }}>{data.name}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ background: 'rgba(10,102,194,0.1)', color: '#0a66c2', padding: '4px 10px', borderRadius: '16px', fontSize: '12px', fontWeight: 600 }}>{data.total_connections} connections</span>
              <span style={{ background: 'rgba(10,102,194,0.1)', color: '#0a66c2', padding: '4px 10px', borderRadius: '16px', fontSize: '12px', fontWeight: 600 }}>{data.total_views_30d} profile views (30d)</span>
              <span style={{ background: 'rgba(10,102,194,0.1)', color: '#0a66c2', padding: '4px 10px', borderRadius: '16px', fontSize: '12px', fontWeight: 600 }}>{data.total_applications} applications</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, marginTop: 16 }}>
            {data.profile_views_30d.length > 0 && (
              <div>
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-sec)', textTransform: 'uppercase', marginBottom: 12 }}>Profile views — last 30 days</p>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={data.profile_views_30d} margin={{ top: 12, right: 12, bottom: 4, left: -20 }}>
                    <defs>
                      <linearGradient id="viewsFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0a66c2" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#0a66c2" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,.04)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#888' }} tickFormatter={fmtDate} interval="preserveStartEnd" axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#888' }} allowDecimals={false} width={40} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltipArea />} />
                    <Area type="monotone" dataKey="views" stroke="#0a66c2" strokeWidth={3} fill="url(#viewsFill)" activeDot={{ r: 6, strokeWidth: 0, fill: '#0a66c2' }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {pieData.length > 0 && (
              <div>
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-sec)', textTransform: 'uppercase', marginBottom: 12 }}>Application status breakdown</p>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} dataKey="value"
                      paddingAngle={2}
                      label={({ name, percent }) => `${name} ${percent !== undefined ? (percent * 100).toFixed(0) : 0}%`}
                      labelLine={false}
                    >
                      {pieData.map((entry, idx) => (
                        <Cell key={entry.name} fill={statusColor(entry.name, idx)} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltipPie />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
