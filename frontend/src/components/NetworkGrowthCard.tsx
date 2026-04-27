import { useState } from 'react'
import { apiPost } from '../api'

type GrowthPayload = {
  window_days: number
  counts: {
    connections_requested: number
    connections_accepted: number
    messages_sent: number
  }
  recent_connection_events: Array<{ payload?: { requester_id?: number; receiver_id?: number }; timestamp?: string }>
  recent_message_events: Array<{ actor_id?: string; payload?: { thread_id?: number }; timestamp?: string }>
}

export function NetworkGrowthCard() {
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [data, setData] = useState<GrowthPayload | null>(null)

  async function load() {
    setLoading(true)
    setErr(null)
    try {
      const r = await apiPost<{ success: boolean; message: string; data: GrowthPayload }>(
        '/analytics/network/growth',
        { window_days: days },
      )
      if (!r.success) throw new Error(r.message)
      setData(r.data)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load network growth')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="chart-card">
      <div className="chart-header">
        <h3 className="chart-title">Network Growth & Messaging</h3>
        <button type="button" className="ghost-btn" onClick={load} disabled={loading}>
          {loading ? '…' : 'Load'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input
          type="number"
          min={1}
          max={365}
          value={days}
          onChange={(e) => setDays(Number(e.target.value || 30))}
          style={{ width: 100 }}
        />
        <span className="meta">days</span>
      </div>

      {err && <p className="error">{err}</p>}
      {data && (
        <>
          <div className="identity-bar" style={{ marginBottom: 8 }}>
            <span>Requested: <strong>{data.counts.connections_requested}</strong></span>
            <span>Accepted: <strong>{data.counts.connections_accepted}</strong></span>
            <span>Messages: <strong>{data.counts.messages_sent}</strong></span>
          </div>
          <p className="hint" style={{ marginBottom: 4 }}>Recent accepted connections</p>
          <ul className="conn-list">
            {data.recent_connection_events.slice(0, 5).map((ev, idx) => (
              <li key={`c-${idx}`} className="conn-item">
                #{ev.payload?.requester_id} connected with #{ev.payload?.receiver_id}
              </li>
            ))}
          </ul>
          <p className="hint" style={{ margin: '8px 0 4px' }}>Recent messages</p>
          <ul className="conn-list">
            {data.recent_message_events.slice(0, 5).map((ev, idx) => (
              <li key={`m-${idx}`} className="conn-item">
                sender #{ev.actor_id} in thread #{ev.payload?.thread_id}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
