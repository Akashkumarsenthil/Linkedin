/**
 * SavesTrendChart — saved jobs per day or week.
 * Auto-loads daily view on mount.
 */
import { useState, useEffect, useCallback } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { apiPost } from '../api'

type Granularity = 'day' | 'week'

interface TrendRow { period: string; count: number }
interface ApiResp { success: boolean; message: string; data: TrendRow[] }

export function SavesTrendChart() {
  const [granularity, setGranularity] = useState<Granularity>('day')
  const [data, setData]               = useState<TrendRow[]>([])
  const [loading, setLoading]         = useState(true)
  const [err, setErr]                 = useState<string | null>(null)

  const load = useCallback(async (g: Granularity) => {
    setLoading(true); setErr(null)
    try {
      const r = await apiPost<ApiResp>('/analytics/saves/trend', {
        window_days: g === 'week' ? 90 : 30, granularity: g,
      })
      if (!r.success) throw new Error(r.message)
      setData(r.data ?? [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load('day') }, [load])

  const switchGranularity = (g: Granularity) => { setGranularity(g); load(g) }
  const fmtPeriod = (p: string) => granularity === 'day' ? p.slice(5) : p
  const total = data.reduce((s, d) => s + d.count, 0)

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="ad-custom-tooltip">
          <div className="ad-custom-tooltip-label">{payload[0].payload.period}</div>
          <div className="ad-custom-tooltip-value"><strong>{payload[0].value}</strong> saves</div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="ad-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h3 className="ad-card-title">Saved Jobs Trend</h3>
        <div className="ad-metric-tabs">
          {(['day', 'week'] as Granularity[]).map(g => (
            <button key={g} type="button"
              className={`ad-metric-tab${granularity === g ? ' active' : ''}`}
              onClick={() => switchGranularity(g)} disabled={loading}
            >{g === 'day' ? 'Daily' : 'Weekly'}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="ad-chart-skeleton">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="ad-skeleton-bar" style={{ width: `${40 + Math.random() * 50}%`, animationDelay: `${i * 0.08}s` }} />
          ))}
        </div>
      ) : err ? <p className="ad-error">{err}</p> : data.length === 0 ? (
        <p className="ad-empty">No saved-job data in the selected window.</p>
      ) : (
        <>
          <p className="ad-card-hint" style={{ marginTop: 4 }}>{total} saves over {data.length} {granularity === 'day' ? 'days' : 'weeks'}</p>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={data} margin={{ top: 12, right: 12, bottom: 4, left: -20 }}>
              <defs>
                <linearGradient id="savesFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent-vibrant)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--accent-vibrant)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,.04)" vertical={false} />
              <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#888', fontWeight: 500 }} tickFormatter={fmtPeriod} interval="preserveStartEnd" axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#888', fontWeight: 500 }} allowDecimals={false} width={40} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="count" stroke="var(--accent-vibrant)" strokeWidth={4} fill="url(#savesFill)" activeDot={{ r: 6, strokeWidth: 0, fill: 'var(--accent-vibrant)' }} />
            </AreaChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  )
}
