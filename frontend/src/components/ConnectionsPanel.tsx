/**
 * ConnectionsPanel — demo UI for connections.
 *
 * No auth exists, so:
 *  - "My member ID" is set manually at the top.
 *  - Accept/reject use a connection_id the user copies from the
 *    "Send request" result panel (the only practical way without a
 *    "list pending" endpoint).
 */
import { useState } from 'react'
import { apiPost } from '../api'

// ── Types ─────────────────────────────────────────────────────────────────────

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
  connected_at?: string
  connected_member?: ConnectedMember
}

interface MutualMember {
  member_id: number
  name: string
  headline: string | null
}

// ── small sub-components ──────────────────────────────────────────────────────

function ResultBanner({ success, message }: { success: boolean; message: string }) {
  return (
    <p className={success ? 'result-ok' : 'error'} style={{ margin: '0.4rem 0 0' }}>
      {message}
    </p>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ConnectionsPanel() {
  // ── shared identity ───────────────────────────────────
  const [myId, setMyId]     = useState('1')
  const [identity, setIdentity] = useState<number | null>(null)

  // ── send request ──────────────────────────────────────
  const [toId, setToId]             = useState('')
  const [reqLoading, setReqL]       = useState(false)
  const [reqResult, setReqResult]   = useState<{ success: boolean; message: string; data?: ConnectionData } | null>(null)

  // ── accept / reject ───────────────────────────────────
  const [connId, setConnId]         = useState('')
  const [arLoading, setArL]         = useState(false)
  const [arResult, setArResult]     = useState<{ success: boolean; message: string } | null>(null)

  // ── my connections list ───────────────────────────────
  const [connections, setConns]     = useState<ConnectionData[]>([])
  const [connsLoading, setConnsL]   = useState(false)
  const [connsErr, setConnsErr]     = useState<string | null>(null)
  const [connsTotal, setConnsTotal] = useState(0)

  // ── mutual connections ────────────────────────────────
  const [otherId, setOtherId]       = useState('')
  const [mutual, setMutual]         = useState<MutualMember[]>([])
  const [mutualLoading, setMutualL] = useState(false)
  const [mutualResult, setMutualR]  = useState<string | null>(null)

  // ── actions ───────────────────────────────────────────

  function applyIdentity() {
    const id = parseInt(myId, 10)
    if (!id || id < 1) return
    setIdentity(id)
    setConns([])
    setMutual([])
    setReqResult(null)
    setArResult(null)
  }

  async function sendRequest() {
    if (!identity) return
    const rid = parseInt(toId, 10)
    if (!rid || rid < 1) {
      setReqResult({ success: false, message: 'Enter a valid receiver ID' })
      return
    }
    setReqL(true)
    setReqResult(null)
    try {
      const r = await apiPost<{ success: boolean; message: string; data?: ConnectionData }>(
        '/connections/request',
        { requester_id: identity, receiver_id: rid },
      )
      setReqResult(r)
    } catch (e) {
      setReqResult({ success: false, message: e instanceof Error ? e.message : 'Request failed' })
    } finally {
      setReqL(false)
    }
  }

  async function acceptConn() {
    const id = parseInt(connId, 10)
    if (!id || id < 1) {
      setArResult({ success: false, message: 'Enter a valid connection ID' })
      return
    }
    setArL(true)
    setArResult(null)
    try {
      const r = await apiPost<{ success: boolean; message: string }>(
        '/connections/accept',
        { connection_id: id },
      )
      setArResult(r)
      if (r.success && identity) loadConnections(identity)
    } catch (e) {
      setArResult({ success: false, message: e instanceof Error ? e.message : 'Failed' })
    } finally {
      setArL(false)
    }
  }

  async function rejectConn() {
    const id = parseInt(connId, 10)
    if (!id || id < 1) {
      setArResult({ success: false, message: 'Enter a valid connection ID' })
      return
    }
    setArL(true)
    setArResult(null)
    try {
      const r = await apiPost<{ success: boolean; message: string }>(
        '/connections/reject',
        { connection_id: id },
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
        '/connections/list',
        { user_id: id, page: 1, page_size: 30 },
      )
      if (!r.success) throw new Error(r.message)
      setConns(r.data ?? [])
      setConnsTotal(r.total ?? 0)
    } catch (e) {
      setConnsErr(e instanceof Error ? e.message : 'Failed to load connections')
    } finally {
      setConnsL(false)
    }
  }

  async function loadMutual() {
    if (!identity) return
    const oid = parseInt(otherId, 10)
    if (!oid || oid < 1) {
      setMutualR('Enter a valid other member ID')
      return
    }
    setMutualL(true)
    setMutualR(null)
    try {
      const r = await apiPost<{ success: boolean; message: string; data: MutualMember[]; total: number }>(
        '/connections/mutual',
        { user_id: identity, other_id: oid },
      )
      if (!r.success) throw new Error(r.message)
      setMutual(r.data ?? [])
      setMutualR(r.message)
    } catch (e) {
      setMutualR(e instanceof Error ? e.message : 'Failed')
    } finally {
      setMutualL(false)
    }
  }

  // ── render ────────────────────────────────────────────

  return (
    <section className="panel">
      <h2>Connections</h2>

      {/* Identity bar */}
      <div className="identity-bar">
        <span className="identity-label">My member ID:</span>
        <input
          type="number"
          value={myId}
          min={1}
          onChange={e => setMyId(e.target.value)}
          style={{ width: 70 }}
          placeholder="ID"
        />
        <button type="button" className="primary" onClick={applyIdentity}>
          Set identity
        </button>
        {identity && (
          <span className="identity-badge">member #{identity}</span>
        )}
      </div>

      {!identity && (
        <p className="hint">Set your member ID above to use connections.</p>
      )}

      {identity && (
        <div className="conn-grid">

          {/* ── Send request ─────────────────────────── */}
          <div className="chart-card">
            <h3 className="chart-title">Send connection request</h3>
            <label className="form-label" style={{ marginTop: '0.25rem' }}>
              Receiver member ID
              <input
                type="number"
                value={toId}
                min={1}
                onChange={e => setToId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendRequest()}
                placeholder="e.g. 2"
                style={{ width: 100 }}
              />
            </label>
            <button
              type="button"
              className="primary"
              onClick={sendRequest}
              disabled={reqLoading}
              style={{ alignSelf: 'flex-start', marginTop: '0.5rem' }}
            >
              {reqLoading ? 'Sending…' : 'Send request'}
            </button>
            {reqResult && (
              <>
                <ResultBanner success={reqResult.success} message={reqResult.message} />
                {reqResult.success && reqResult.data && (
                  <div className="conn-detail">
                    <span>connection_id: <strong>{reqResult.data.connection_id}</strong></span>
                    <span className={`conn-status status-${reqResult.data.status}`}>
                      {reqResult.data.status}
                    </span>
                    <p className="hint" style={{ margin: '0.4rem 0 0', fontSize: '0.78rem' }}>
                      Copy this connection_id to accept or reject it below.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Accept / Reject ──────────────────────── */}
          <div className="chart-card">
            <h3 className="chart-title">Accept or reject a request</h3>
            <p className="hint" style={{ margin: '0.25rem 0 0.5rem' }}>
              Paste the <code>connection_id</code> from a pending request.
            </p>
            <label className="form-label">
              Connection ID
              <input
                type="number"
                value={connId}
                min={1}
                onChange={e => setConnId(e.target.value)}
                placeholder="e.g. 42"
                style={{ width: 100 }}
              />
            </label>
            <div className="row" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
              <button
                type="button"
                className="primary"
                onClick={acceptConn}
                disabled={arLoading}
              >
                {arLoading ? '…' : 'Accept'}
              </button>
              <button
                type="button"
                className="danger-btn"
                onClick={rejectConn}
                disabled={arLoading}
              >
                {arLoading ? '…' : 'Reject'}
              </button>
            </div>
            {arResult && (
              <ResultBanner success={arResult.success} message={arResult.message} />
            )}
          </div>

          {/* ── My connections ───────────────────────── */}
          <div className="chart-card">
            <div className="chart-header">
              <h3 className="chart-title">My connections</h3>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => loadConnections(identity)}
                disabled={connsLoading}
                title="Refresh"
              >
                {connsLoading ? '…' : '↺ Load'}
              </button>
            </div>
            {connsErr && <p className="error">{connsErr}</p>}
            {connections.length === 0 && !connsLoading && (
              <p className="hint" style={{ margin: '0.4rem 0 0' }}>
                Click ↺ Load to fetch accepted connections.
              </p>
            )}
            {connections.length > 0 && (
              <>
                <p className="meta">{connsTotal} accepted connection{connsTotal !== 1 ? 's' : ''}</p>
                <ul className="conn-list">
                  {connections.map(c => {
                    const m = c.connected_member
                    return (
                      <li key={c.connection_id} className="conn-item">
                        <div className="conn-item-name">
                          {m ? m.name : `Member #${c.requester_id === identity ? c.receiver_id : c.requester_id}`}
                        </div>
                        {m?.headline && (
                          <div className="conn-item-headline muted">{m.headline}</div>
                        )}
                        <span className={`conn-status status-${c.status}`}>{c.status}</span>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </div>

          {/* ── Mutual connections ───────────────────── */}
          <div className="chart-card">
            <h3 className="chart-title">Mutual connections</h3>
            <p className="hint" style={{ margin: '0.25rem 0 0.5rem' }}>
              Find connections shared between you (#{identity}) and another member.
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
                style={{ width: 100 }}
              />
            </label>
            <button
              type="button"
              className="primary"
              onClick={loadMutual}
              disabled={mutualLoading}
              style={{ alignSelf: 'flex-start', marginTop: '0.5rem' }}
            >
              {mutualLoading ? 'Finding…' : 'Find mutual'}
            </button>
            {mutualResult && (
              <p className="meta" style={{ margin: '0.4rem 0 0' }}>{mutualResult}</p>
            )}
            {mutual.length > 0 && (
              <ul className="conn-list" style={{ marginTop: '0.5rem' }}>
                {mutual.map(m => (
                  <li key={m.member_id} className="conn-item">
                    <div className="conn-item-name">{m.name}</div>
                    {m.headline && <div className="conn-item-headline muted">{m.headline}</div>}
                  </li>
                ))}
              </ul>
            )}
            {mutual.length === 0 && mutualResult && !mutualLoading && (
              <p className="hint" style={{ marginTop: '0.25rem' }}>No mutual connections found.</p>
            )}
          </div>

        </div>
      )}
    </section>
  )
}
