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

export function ConnectionsPanel({ onNavigateProfile }: { onNavigateProfile?: (id: number) => void }) {
  const identity = parseStoredUser()
  const myId = identity ? identity.user_id : null

  const [toId, setToId]           = useState('')
  const [toName, setToName]       = useState('')
  const [toResults, setToResults] = useState<any[]>([])
  const [reqLoading, setReqL]     = useState(false)
  const [reqResult, setReqResult] = useState<{ success: boolean; message: string; data?: ConnectionData } | null>(null)

  const [arLoading, setArL]       = useState(false)
  const [arResult, setArResult]   = useState<{ success: boolean; message: string } | null>(null)

  const [connections, setConns]   = useState<ConnectionData[]>([])
  const [connsLoading, setConnsL] = useState(false)
  const [connsErr, setConnsErr]   = useState<string | null>(null)
  const [connsTotal, setConnsT]   = useState(0)
  const [connsFilter, setConnsFilter] = useState('')

  const [pending, setPending]     = useState<ConnectionData[]>([])
  const [pendingLoading, setPendingL] = useState(false)
  const [pendingErr, setPendingErr]   = useState<string | null>(null)
  const [pendingTotal, setPendingT]   = useState(0)


  const [otherId, setOtherId]     = useState('')
  const [otherName, setOtherName] = useState('')
  const [otherResults, setOtherResults] = useState<any[]>([])
  const [mutual, setMutual]       = useState<MutualMember[]>([])
  const [mutualLoading, setMutL]  = useState(false)
  const [mutualResult, setMutR]   = useState<string | null>(null)

  // Auto-load connections when component mounts if identity is present
  useEffect(() => {
    if (myId) {
      loadConnections(myId)
      loadPending(myId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Name Search Helpers ──────────────────────────────────────────────────

  async function searchPeople(query: string, setResults: (vals: any[]) => void) {
    if (query.length < 2) { setResults([]); return }
    try {
      const res = await apiPost<{ data: any[] }>('/members/search', { keyword: query, page_size: 5 })
      setResults(res.data || [])
    } catch {
      setResults([])
    }
  }

  useEffect(() => {
    const t = setTimeout(() => searchPeople(toName, setToResults), 300)
    return () => clearTimeout(t)
  }, [toName])

  useEffect(() => {
    const t = setTimeout(() => searchPeople(otherName, setOtherResults), 300)
    return () => clearTimeout(t)
  }, [otherName])

  async function sendRequest() {
    if (!myId) return
    const rid = parseInt(toId, 10)
    if (!rid || rid < 1) { setReqResult({ success: false, message: 'Select a member from the search results' }); return }
    setReqL(true)
    setReqResult(null)
    try {
      const r = await apiPost<{ success: boolean; message: string; data?: ConnectionData }>(
        '/connections/request', { requester_id: myId, receiver_id: rid },
      )
      setReqResult(r)
      if (r.success) {
        loadConnections(myId)
        setToId('')
        setToName('')
        setToResults([])
      }
    } catch (e) {
      setReqResult({ success: false, message: e instanceof Error ? e.message : 'Request failed' })
    } finally {
      setReqL(false)
    }
  }

  async function acceptConn(id: number) {
    if (!id || id < 1) { setArResult({ success: false, message: 'Invalid connection ID' }); return }
    setArL(true)
    setArResult(null)
    try {
      const r = await apiPost<{ success: boolean; message: string }>(
        '/connections/accept', { connection_id: id },
      )
      setArResult(r)
      if (r.success && myId) {
        loadConnections(myId)
        loadPending(myId)
      }
    } catch (e) {
      setArResult({ success: false, message: e instanceof Error ? e.message : 'Failed' })
    } finally {
      setArL(false)
    }
  }

  async function rejectConn(id: number) {
    if (!id || id < 1) { setArResult({ success: false, message: 'Invalid connection ID' }); return }
    setArL(true)
    setArResult(null)
    try {
      const r = await apiPost<{ success: boolean; message: string }>(
        '/connections/reject', { connection_id: id },
      )
      setArResult(r)
      if (r.success && myId) {
        loadPending(myId)
      }
    } catch (e) {
      setArResult({ success: false, message: e instanceof Error ? e.message : 'Failed' })
    } finally {
      setArL(false)
    }
  }

  async function loadPending(id: number) {
    setPendingL(true)
    setPendingErr(null)
    try {
      const r = await apiPost<{ success: boolean; message: string; data: ConnectionData[]; total: number }>(
        '/connections/pending', { user_id: id, page: 1, page_size: 30 },
      )
      if (!r.success) throw new Error(r.message)
      setPending(r.data ?? [])
      setPendingT(r.total ?? 0)
    } catch (e) {
      setPendingErr(e instanceof Error ? e.message : 'Failed to load pending requests')
    } finally {
      setPendingL(false)
    }
  }

  async function loadConnections(id: number) {
    setConnsL(true)
    setConnsErr(null)
    try {
      const r = await apiPost<{ success: boolean; message: string; data: ConnectionData[]; total: number }>(
        '/connections/list', { user_id: id, page: 1, page_size: 100 },
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
    if (!oid || oid < 1) { setMutR('Select a member from the search results'); return }
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

  const filteredConnections = connections.filter(c => {
    const name = (c.connected_member?.name || '').toLowerCase()
    return name.includes(connsFilter.toLowerCase())
  })

  // Allow both members and recruiters to access the connections section
  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="panel-title">My Network</h2>
        <p className="panel-subtitle">
          Signed in as <strong>{identity.user_type} #{myId}</strong> · {identity.email}
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
          <p className="hint" style={{ marginTop: 0 }}>Search by name to find someone to connect with.</p>
          
          <div className="search-input-wrap">
            <input
              type="text"
              value={toName}
              onChange={e => { setToName(e.target.value); if(!e.target.value) setToId('') }}
              placeholder="Search by name..."
              className="search-bar-input"
            />
            {toResults.length > 0 && !toId && (
              <div className="search-dropdown panel">
                {toResults.map(m => (
                  <div key={m.member_id} className="search-item" onClick={() => { 
                    setToId(String(m.member_id)); 
                    setToName(`${m.first_name} ${m.last_name}`);
                    setToResults([]);
                  }}>
                    <div className="search-item-info">
                      <div className="search-item-name">{m.first_name} {m.last_name}</div>
                      <div className="search-item-headline">{m.headline}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button type="button" className="primary" onClick={sendRequest} disabled={reqLoading || !toId}
            style={{ alignSelf: 'flex-start', marginTop: 12 }}>
            {reqLoading ? 'Sending…' : 'Send request'}
          </button>
          
          {reqResult && (
            <ResultBanner success={reqResult.success} message={reqResult.message} />
          )}
        </div>

        {/* ── Accept / Reject ──────────────────────── */}
        <div className="chart-card">
          <div className="chart-header">
            <h3 className="chart-title">
              Respond to a request {pendingTotal > 0 && <span style={{ opacity: 0.6 }}>({pendingTotal})</span>}
            </h3>
            <button type="button" className="ghost-btn" onClick={() => loadPending(myId!)} disabled={pendingLoading}>
              {pendingLoading ? '…' : '↺ Refresh'}
            </button>
          </div>
          {pendingErr && <p className="error">{pendingErr}</p>}
          {arResult && <ResultBanner success={arResult.success} message={arResult.message} />}
          {pending.length === 0 && !pendingLoading && (
            <p className="hint">No pending requests.</p>
          )}
          {pending.length > 0 && (
            <ul className="conn-list">
              {pending.map(c => {
                const m = c.connected_member
                return (
                  <li key={c.connection_id} className="conn-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div 
                        className="member-avatar" 
                        style={{ width: 32, height: 32, fontSize: 13, background: '#0a66c2', flexShrink: 0, cursor: 'pointer' }}
                        onClick={() => onNavigateProfile?.(c.requester_id)}
                      >
                        {(m?.name ?? '?')[0].toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div 
                          className="conn-item-name" 
                          style={{ cursor: 'pointer' }}
                          onClick={() => onNavigateProfile?.(c.requester_id)}
                        >
                          {m ? m.name : `Member #${c.requester_id}`}
                        </div>
                        {m?.headline && <div className="conn-item-headline muted">{m.headline}</div>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                      <button type="button" className="ghost-btn" onClick={() => rejectConn(c.connection_id)} disabled={arLoading}>
                        Decline
                      </button>
                      <button type="button" className="primary" onClick={() => acceptConn(c.connection_id)} disabled={arLoading}>
                        Accept
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* ── My connections ───────────────────────── */}
        <div className="chart-card">
          <div className="chart-header">
            <h3 className="chart-title">My connections</h3>
            <button type="button" className="ghost-btn" onClick={() => loadConnections(myId!)} disabled={connsLoading}>
              {connsLoading ? '…' : '↺ Refresh'}
            </button>
          </div>
          
          <input 
            type="text" 
            placeholder="Search connections..." 
            value={connsFilter}
            onChange={e => setConnsFilter(e.target.value)}
            className="search-bar-input"
            style={{ marginBottom: 12 }}
          />

          {connsErr && <p className="error">{connsErr}</p>}
          {connections.length === 0 && !connsLoading && (
            <p className="hint">No accepted connections yet.</p>
          )}
          {filteredConnections.length === 0 && connections.length > 0 && (
            <p className="hint">No matches for "{connsFilter}".</p>
          )}
          {filteredConnections.length > 0 && (
            <ul className="conn-list">
              {filteredConnections.map(c => {
                const m = c.connected_member
                return (
                  <li key={c.connection_id} className="conn-item">
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <div 
                        className="member-avatar" 
                        style={{ width: 32, height: 32, fontSize: 13, background: '#0a66c2', flexShrink: 0, cursor: 'pointer', marginTop: 2 }}
                        onClick={() => {
                          const otherId = c.requester_id === myId ? c.receiver_id : c.requester_id
                          onNavigateProfile?.(otherId)
                        }}
                      >
                        {(m?.name ?? '?')[0].toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div 
                          className="conn-item-name" 
                          style={{ cursor: 'pointer' }}
                          onClick={() => {
                            const otherId = c.requester_id === myId ? c.receiver_id : c.requester_id
                            onNavigateProfile?.(otherId)
                          }}
                        >
                          {m ? m.name : `Member #${c.requester_id === myId ? c.receiver_id : c.requester_id}`}
                        </div>
                        {m?.headline && <div className="conn-item-headline muted">{m.headline}</div>}
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', alignSelf: 'center' }}>
                        <span className="conn-badge">Accepted</span>
                        <button 
                          className="ghost-btn" 
                          style={{ color: '#d11124', fontSize: 12, padding: '2px 8px' }}
                          onClick={async () => {
                            if (!window.confirm('Are you sure you want to remove this connection?')) return
                            const otherId = c.requester_id === myId ? c.receiver_id : c.requester_id
                            try {
                              const res = await apiPost<any>('/connections/remove', { user_id: myId, other_id: otherId })
                              if (res.success) loadConnections(myId!)
                              else alert(res.message)
                            } catch (e) {
                              alert('Failed to remove connection')
                            }
                          }}
                        >
                          Remove
                        </button>
                      </div>
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
            Search by name to find mutual connections with another member.
          </p>
          
          <div className="search-input-wrap">
            <input
              type="text"
              value={otherName}
              onChange={e => { setOtherName(e.target.value); if(!e.target.value) setOtherId('') }}
              placeholder="Search by name..."
              className="search-bar-input"
            />
            {otherResults.length > 0 && !otherId && (
              <div className="search-dropdown panel">
                {otherResults.map(m => (
                  <div key={m.member_id} className="search-item" onClick={() => { 
                    setOtherId(String(m.member_id)); 
                    setOtherName(`${m.first_name} ${m.last_name}`);
                    setOtherResults([]);
                  }}>
                    <div className="search-item-info">
                      <div className="search-item-name">{m.first_name} {m.last_name}</div>
                      <div className="search-item-headline">{m.headline}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button type="button" className="primary" onClick={loadMutual} disabled={mutualLoading || !otherId}
            style={{ alignSelf: 'flex-start', marginTop: 12 }}>
            {mutualLoading ? 'Finding…' : 'Find mutual'}
          </button>
          
          {mutualResult && <p className="meta" style={{ marginTop: 4 }}>{mutualResult}</p>}
          {mutual.length > 0 && (
            <ul className="conn-list" style={{ marginTop: 8 }}>
              {mutual.map(m => (
                <li key={m.member_id} className="conn-item">
                  <div 
                    className="conn-item-name" 
                    style={{ cursor: 'pointer' }}
                    onClick={() => onNavigateProfile?.(m.member_id)}
                  >
                    {m.name}
                  </div>
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
