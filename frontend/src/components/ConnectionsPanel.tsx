/**
 * ConnectionsPanel — LinkedIn-style network connections UI.
 * Uses the stored JWT token for member identity.
 */
import { useState, useEffect } from 'react'
import { apiPost, parseStoredUser } from '../api'

interface ConnectedMember {
  member_id: number
  name: string
  headline: string | null
}

interface ConnectionData {
  connection_id: number
  requester_id: number
  receiver_id: number
  status: string
  connected_member?: ConnectedMember
}

interface MutualMember {
  member_id: number
  name: string
  headline: string | null
}

function ResultBanner({ success, message }: { success: boolean; message: string }) {
  return <p className={success ? 'result-ok' : 'error'} style={{ marginTop: 6 }}>{message}</p>
}

export function ConnectionsPanel() {
  const identity = parseStoredUser()
  const myId = identity?.user_type === 'member' ? identity.user_id : null

  const [toId, setToId]           = useState('')
  const [reqLoading, setReqL]     = useState(false)
  const [reqResult, setReqResult] = useState<{ success: boolean; message: string; data?: ConnectionData } | null>(null)

  const [connId, setConnId]       = useState('')
  const [arLoading, setArL]       = useState(false)
  const [arResult, setArResult]   = useState<{ success: boolean; message: string } | null>(null)

  const [connections, setConns]   = useState<ConnectionData[]>([])
  const [connsLoading, setConnsL] = useState(false)
  const [connsErr, setConnsErr]   = useState<string | null>(null)
  const [connsTotal, setConnsT]   = useState(0)

  const [otherId, setOtherId]     = useState('')
  const [mutual, setMutual]       = useState<MutualMember[]>([])
  const [mutualLoading, setMutL]  = useState(false)
  const [mutualResult, setMutR]   = useState<string | null>(null)

  // Auto-load connections when component mounts if identity is a member
  useEffect(() => {
    if (myId) loadConnections(myId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function sendRequest() {
    if (!myId) return
    const rid = parseInt(toId, 10)
    if (!rid || rid < 1) { setReqResult({ success: false, message: 'Enter a valid receiver ID' }); return }
    setReqL(true)
    setReqResult(null)
    try {
      const r = await apiPost<{ success: boolean; message: string; data?: ConnectionData }>(
        '/connections/request', { requester_id: myId, receiver_id: rid },
      )
      setReqResult(r)
      if (r.success) loadConnections(myId)
    } catch (e) {
      setReqResult({ success: false, message: e instanceof Error ? e.message : 'Request failed' })
    } finally {
      setReqL(false)
    }
  }

  async function acceptConn() {
    const id = parseInt(connId, 10)
    if (!id || id < 1) { setArResult({ success: false, message: 'Enter a valid connection ID' }); return }
    setArL(true)
    setArResult(null)
    try {
      const r = await apiPost<{ success: boolean; message: string }>(
        '/connections/accept', { connection_id: id },
      )
      setArResult(r)
      if (r.success && myId) loadConnections(myId)
    } catch (e) {
      setArResult({ success: false, message: e instanceof Error ? e.message : 'Failed' })
    } finally {
      setArL(false)
    }
  }

  async function rejectConn() {
    const id = parseInt(connId, 10)
    if (!id || id < 1) { setArResult({ success: false, message: 'Enter a valid connection ID' }); return }
    setArL(true)
    setArResult(null)
    try {
      const r = await apiPost<{ success: boolean; message: string }>(
        '/connections/reject', { connection_id: id },
      )
      setArResult(r)
    } catch (e) {
      setArResult({ success: false, message: e instanceof Error ? e.message : 'Failed' })
    } finally {
      setArL(false)
    }
  }

  async function loadConnections(id: number) {
    setConnsL(true)
    setConnsErr(null)
    try {
      const r = await apiPost<{ success: boolean; message: string; data: ConnectionData[]; total: number }>(
        '/connections/list', { user_id: id, page: 1, page_size: 30 },
      )
      if (!r.success) throw new Error(r.message)
      setConns(r.data ?? [])
      setConnsT(r.total ?? 0)
    } catch (e) {
      setConnsErr(e instanceof Error ? e.message : 'Failed to load connections')
    } finally {
      setConnsL(false)
    }
  }

  async function loadMutual() {
    if (!myId) return
    const oid = parseInt(otherId, 10)
    if (!oid || oid < 1) { setMutR('Enter a valid other member ID'); return }
    setMutL(true)
    setMutR(null)
    try {
      const r = await apiPost<{ success: boolean; message: string; data: MutualMember[]; total: number }>(
        '/connections/mutual', { user_id: myId, other_id: oid },
      )
      if (!r.success) throw new Error(r.message)
      setMutual(r.data ?? [])
      setMutR(r.message)
    } catch (e) {
      setMutR(e instanceof Error ? e.message : 'Failed')
    } finally {
      setMutL(false)
    }
  }

  // Not logged in
  if (!identity) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Connections</h2>
        </div>
        <div className="auth-prompt-card">
          <p className="auth-prompt-title">Sign in to manage your network</p>
          <p className="auth-prompt-sub">Connect with other professionals on the platform.</p>
        </div>
      </section>
    )
  }

  // Recruiter accessing member-only section
  if (identity.user_type !== 'member') {
    return (
      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Connections</h2>
        </div>
        <div className="auth-prompt-card">
          <p className="auth-prompt-title">Connections are for members</p>
          <p className="auth-prompt-sub">Log in as a member to send and manage connection requests.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="panel-title">My Network</h2>
        <p className="panel-subtitle">
          Signed in as <strong>member #{myId}</strong> · {identity.email}
        </p>
      </div>

      {/* Connections count banner */}
      {connsTotal > 0 && (
        <div className="identity-bar">
          <strong>{connsTotal}</strong>
          <span>accepted connection{connsTotal !== 1 ? 's' : ''}</span>
        </div>
      )}

      <div className="conn-grid">
        {/* ── Send request ────────────────────────── */}
        <div className="chart-card">
          <h3 className="chart-title">Connect with someone</h3>
          <p className="hint" style={{ marginTop: 0 }}>Enter the member ID of the person you want to connect with.</p>
          <label className="form-label">
            Member ID
            <input
              type="number"
              value={toId}
              min={1}
              onChange={e => setToId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendRequest()}
              placeholder="e.g. 2"
            />
          </label>
          <button type="button" className="primary" onClick={sendRequest} disabled={reqLoading}
            style={{ alignSelf: 'flex-start' }}>
            {reqLoading ? 'Sending…' : 'Send request'}
          </button>
          {reqResult && (
            <>
              <ResultBanner success={reqResult.success} message={reqResult.message} />
              {reqResult.success && reqResult.data && (
                <div className="conn-detail">
                  <span>Connection ID: <strong>#{reqResult.data.connection_id}</strong></span>
                  <span className={`conn-status status-${reqResult.data.status}`}>{reqResult.data.status}</span>
                  <p className="hint" style={{ marginTop: 4, fontSize: 11 }}>
                    Copy this ID to accept or reject the request below.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Accept / Reject ──────────────────────── */}
        <div className="chart-card">
          <h3 className="chart-title">Respond to a request</h3>
          <p className="hint" style={{ marginTop: 0 }}>
            Paste a <code>connection_id</code> from a pending request to accept or reject it.
          </p>
          <label className="form-label">
            Connection ID
            <input
              type="number"
              value={connId}
              min={1}
              onChange={e => setConnId(e.target.value)}
              placeholder="e.g. 42"
            />
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="button" className="primary" onClick={acceptConn} disabled={arLoading}>
              {arLoading ? '…' : 'Accept'}
            </button>
            <button type="button" className="danger-btn" onClick={rejectConn} disabled={arLoading}>
              {arLoading ? '…' : 'Decline'}
            </button>
          </div>
          {arResult && <ResultBanner success={arResult.success} message={arResult.message} />}
        </div>

        {/* ── My connections ───────────────────────── */}
        <div className="chart-card">
          <div className="chart-header">
            <h3 className="chart-title">My connections</h3>
            <button type="button" className="ghost-btn" onClick={() => loadConnections(myId!)} disabled={connsLoading}>
              {connsLoading ? '…' : '↺ Refresh'}
            </button>
          </div>
          {connsErr && <p className="error">{connsErr}</p>}
          {connections.length === 0 && !connsLoading && (
            <p className="hint">No accepted connections yet.</p>
          )}
          {connections.length > 0 && (
            <ul className="conn-list">
              {connections.map(c => {
                const m = c.connected_member
                return (
                  <li key={c.connection_id} className="conn-item">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="member-avatar" style={{ width: 32, height: 32, fontSize: 13, background: '#0a66c2', flexShrink: 0 }}>
                        {(m?.name ?? '?')[0].toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="conn-item-name">
                          {m ? m.name : `Member #${c.requester_id === myId ? c.receiver_id : c.requester_id}`}
                        </div>
                        {m?.headline && <div className="conn-item-headline muted">{m.headline}</div>}
                      </div>
                      <span className={`conn-status status-${c.status}`}>{c.status}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* ── Mutual connections ───────────────────── */}
        <div className="chart-card">
          <h3 className="chart-title">Mutual connections</h3>
          <p className="hint" style={{ marginTop: 0 }}>
            Find connections you share with another member.
          </p>
          <label className="form-label">
            Other member ID
            <input
              type="number"
              value={otherId}
              min={1}
              onChange={e => setOtherId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loadMutual()}
              placeholder="e.g. 5"
            />
          </label>
          <button type="button" className="primary" onClick={loadMutual} disabled={mutualLoading}
            style={{ alignSelf: 'flex-start' }}>
            {mutualLoading ? 'Finding…' : 'Find mutual'}
          </button>
          {mutualResult && <p className="meta" style={{ marginTop: 4 }}>{mutualResult}</p>}
          {mutual.length > 0 && (
            <ul className="conn-list" style={{ marginTop: 8 }}>
              {mutual.map(m => (
                <li key={m.member_id} className="conn-item">
                  <div className="conn-item-name">{m.name}</div>
                  {m.headline && <div className="conn-item-headline muted">{m.headline}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
