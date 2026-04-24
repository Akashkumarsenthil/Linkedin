import { useState } from 'react'
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
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState<string | null>(null)

  const load = async () => {
    const id = parseInt(jobId, 10)
    if (!id || id < 1) { setErr('Enter a valid job ID'); return }
    setLoading(true)
    setErr(null)
    try {
      const r = await apiPost<ApiResp>('/analytics/funnel', {
        job_id: id,
        window_days: 365,
      })
      if (!r.success) throw new Error(r.message)
      setData(r.data)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  const chartData = data
    ? [
        { stage: 'Views',    value: data.views,        color: STAGE_COLORS[0] },
        { stage: 'Saves',    value: data.saves,        color: STAGE_COLORS[1] },
        { stage: 'Applies',  value: data.applications, color: STAGE_COLORS[2] },
      ]
    : []

  return (
    <div className="chart-card">
      <div className="chart-header">
        <h3 className="chart-title">Application Funnel</h3>
      </div>

      <div className="row">
        <label>
          Job ID
          <input
            type="number"
            value={jobId}
            min={1}
            onChange={e => setJobId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()}
            style={{ width: 80 }}
          />
        </label>
        <button type="button" className="primary" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Load funnel'}
        </button>
      </div>

      {err && <p className="error">{err}</p>}

      {data && (
        <>
          <p className="hint" style={{ margin: '0 0 0.5rem' }}>{data.title}</p>

          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 16, right: 16, bottom: 4, left: 0 }}>
              <XAxis dataKey="stage" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(val) => [typeof val === 'number' ? val.toLocaleString() : val, 'count']} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                <LabelList
                  dataKey="value"
                  position="top"
                  style={{ fontSize: 12, fontWeight: 600, fill: 'var(--text)' }}
                />
                {chartData.map(entry => (
                  <Cell key={entry.stage} fill={entry.color} />
                ))}
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
              <span className="funnel-rate-value">{data.view_to_apply_rate}%</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
