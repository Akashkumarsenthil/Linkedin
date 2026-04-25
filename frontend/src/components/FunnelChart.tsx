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

  return (
    <div className="ad-card">
      <h3 className="ad-card-title">Application Funnel</h3>

      <div className="ad-inline-controls">
        <label className="ad-inline-label">
          Job ID
          <input className="ad-inline-input" type="number" value={jobId} min={1}
            onChange={e => setJobId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()} />
        </label>
        <button type="button" className="ad-load-btn" onClick={() => load()} disabled={loading}>
          {loading ? 'Loading…' : 'Go'}
        </button>
      </div>

      {err && <p className="ad-error">{err}</p>}

      {loading && !data ? (
        <div className="ad-chart-skeleton">
          {[1,2,3].map(i => <div key={i} className="ad-skeleton-bar" style={{ width: `${90 - i*20}%` }} />)}
        </div>
      ) : data && (
        <>
          <p className="ad-card-hint">{data.title}</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 24, right: 16, bottom: 4, left: 0 }}>
              <XAxis dataKey="stage" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={48}>
                <LabelList dataKey="value" position="top" style={{ fontSize: 13, fontWeight: 700, fill: 'var(--text)' }} />
                {chartData.map(entry => <Cell key={entry.stage} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div className="funnel-rates">
            <div className="funnel-rate-item">
              <span className="funnel-rate-label">View → Save</span>
              <span className="funnel-rate-value">{data.view_to_save_rate}%</span>
            </div>
            <div className="funnel-rate-divider" />
            <div className="funnel-rate-item">
              <span className="funnel-rate-label">Save → Apply</span>
              <span className="funnel-rate-value">{data.save_to_apply_rate}%</span>
            </div>
            <div className="funnel-rate-divider" />
            <div className="funnel-rate-item">
              <span className="funnel-rate-label">Overall</span>
              <span className="funnel-rate-value" style={{ color: 'var(--accent)' }}>{data.view_to_apply_rate}%</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
