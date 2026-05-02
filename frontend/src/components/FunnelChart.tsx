import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts'
import { apiPost } from '../api'

interface FunnelData {
  job_id: number
  title: string
  views: number
  saves: number
  applications: number
  view_to_save_rate: number
  save_to_apply_rate: number
  view_to_apply_rate: number
}

interface ApiResp {
  success: boolean
  message: string
  data: FunnelData
}

const STAGE_COLORS = ['#378fe9', '#0a66c2', '#084d94']

export function FunnelChart() {
  const [jobId, setJobId]     = useState('1')
  const [data, setData]       = useState<FunnelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState<string | null>(null)

  const load = async (id?: string) => {
    const numId = parseInt(id ?? jobId, 10)
    if (!numId || numId < 1) { setErr('Enter a valid job ID'); return }
    setLoading(true); setErr(null)
    try {
      const r = await apiPost<ApiResp>('/analytics/funnel', { job_id: numId, window_days: 365 })
      if (!r.success) throw new Error(r.message)
      setData(r.data)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed')
    } finally { setLoading(false) }
  }

  useEffect(() => { load('1') }, [])

  const chartData = data
    ? [
        { stage: 'Views', value: data.views, color: STAGE_COLORS[0] },
        { stage: 'Saves', value: data.saves, color: STAGE_COLORS[1] },
        { stage: 'Applies', value: data.applications, color: STAGE_COLORS[2] },
      ]
    : []

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="ad-custom-tooltip">
          <div className="ad-custom-tooltip-label">{payload[0].payload.stage}</div>
          <div className="ad-custom-tooltip-value"><strong>{payload[0].value}</strong></div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="ad-card">
      <h3 className="ad-card-title">Application Funnel</h3>

      <div className="ad-form-row">
        <input className="ad-input" type="number" value={jobId} min={1} placeholder="Job ID"
          onChange={e => setJobId(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load()} />
        <button type="button" className="ad-btn" onClick={() => load()} disabled={loading}>
          {loading ? '...' : 'Go'}
        </button>
      </div>

      {err && <p className="ad-error">{err}</p>}

      {loading && !data ? (
        <div className="ad-chart-skeleton">
          {[1,2,3].map(i => <div key={i} className="ad-skeleton-bar" style={{ width: `${90 - i*20}%` }} />)}
        </div>
      ) : data && (
        <>
          <p className="ad-card-hint" style={{ marginTop: 8 }}>{data.title}</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 24, right: 16, bottom: 4, left: 0 }}>
              <defs>
                <linearGradient id="colorStage0" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#70B5F9" stopOpacity={1}/>
                  <stop offset="95%" stopColor="#0A66C2" stopOpacity={1}/>
                </linearGradient>
                <linearGradient id="colorStage1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0A66C2" stopOpacity={1}/>
                  <stop offset="95%" stopColor="#004182" stopOpacity={1}/>
                </linearGradient>
                <linearGradient id="colorStage2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#004182" stopOpacity={1}/>
                  <stop offset="95%" stopColor="#002244" stopOpacity={1}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="stage" tick={{ fontSize: 12, fill: '#888', fontWeight: 600 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.02)' }} />
              <Bar dataKey="value" radius={[8, 8, 0, 0]} barSize={48}>
                <LabelList dataKey="value" position="top" style={{ fontSize: 14, fontWeight: 800, fill: 'var(--accent-vibrant)' }} />
                {chartData.map((entry, index) => <Cell key={entry.stage} fill={`url(#colorStage${index})`} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'var(--surface2)', borderRadius: '8px', marginTop: '8px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-sec)', textTransform: 'uppercase' }}>View → Save</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>{data.view_to_save_rate}%</div>
            </div>
            <div style={{ width: 1, background: 'var(--border)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-sec)', textTransform: 'uppercase' }}>Save → Apply</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>{data.save_to_apply_rate}%</div>
            </div>
            <div style={{ width: 1, background: 'var(--border)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-sec)', textTransform: 'uppercase' }}>Overall</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#0a66c2' }}>{data.view_to_apply_rate}%</div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
