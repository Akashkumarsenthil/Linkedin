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
      <section className="panel notif-panel premium-panel">
        <header className="notif-header premium-header">
          <h2 className="panel-title">Connections</h2>
        </header>
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
    <div className="connections-page-wrapper premium-panel" style={{ maxWidth: '1128px', margin: '0 auto' }}>
      <div className="premium-header">
        <div>
          <h2 className="premium-title">My Network</h2>
          <p className="premium-subtitle">Manage your connections and grow your professional circle.</p>
        </div>
      </div>
      <div className="page-grid-2" style={{ padding: '20px' }}>

      {/* Left Rail */}
      <div className="left-rail">
        <div className="li-card premium-panel">
          <header className="premium-header" style={{ padding: '12px 16px' }}>
            <span className="premium-title" style={{ fontSize: 13 }}>Manage my network</span>
          </header>
          <div style={{ padding: '0 16px 12px' }}>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', color: 'var(--text-sec)', fontSize: '14px', cursor: 'pointer' }} onClick={() => document.getElementById('conns-section')?.scrollIntoView({ behavior: 'smooth' })}>
                <span style={{ cursor: 'pointer' }}>Connections</span>
                <span>{connsTotal}</span>
              </li>
              <li style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', color: 'var(--text-sec)', fontSize: '14px', cursor: 'pointer' }} onClick={() => document.getElementById('pending-section')?.scrollIntoView({ behavior: 'smooth' })}>
                <span style={{ cursor: 'pointer' }}>Pending Requests</span>
                <span>{pendingTotal}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        {/* Invitations */}
        <div id="pending-section" className="li-card">
          <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 400, color: 'var(--text)' }}>Invitations</h2>
            <button type="button" className="ghost-btn" onClick={() => loadPending(myId!)} disabled={pendingLoading} style={{ fontSize: '14px' }}>
              {pendingLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
          <div style={{ padding: '16px' }}>
            {pendingErr && <p className="error">{pendingErr}</p>}
            {arResult && <ResultBanner success={arResult.success} message={arResult.message} />}
            {pending.length === 0 && !pendingLoading && (
              <p className="hint">No pending requests.</p>
            )}
            {pending.length > 0 && (
              <ul className="conn-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {pending.map(c => {
                  const m = c.connected_member
                  return (
                    <li key={c.connection_id} className="conn-item" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div 
                          className="member-avatar" 
                          style={{ width: 48, height: 48, fontSize: 20, background: '#0a66c2', flexShrink: 0, cursor: 'pointer', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}
                          onClick={() => onNavigateProfile?.(c.requester_id)}
                        >
                          {(m?.name ?? '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <div 
                            className="conn-item-name" 
                            style={{ cursor: 'pointer', fontWeight: 600, fontSize: '16px', color: 'var(--text)' }}
                            onClick={() => onNavigateProfile?.(c.requester_id)}
                          >
                            {m ? m.name : `Member #${c.requester_id}`}
                          </div>
                          {m?.headline && <div className="conn-item-headline muted" style={{ fontSize: '14px' }}>{m.headline}</div>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button type="button" className="ghost-btn" onClick={() => rejectConn(c.connection_id)} disabled={arLoading} style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-sec)', padding: '6px 12px' }}>
                          Ignore
                        </button>
                        <button type="button" className="secondary-btn" onClick={() => acceptConn(c.connection_id)} disabled={arLoading} style={{ fontSize: '16px', fontWeight: 600, padding: '6px 16px', borderRadius: '24px' }}>
                          Accept
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Connect with someone */}
        <div className="li-card" style={{ overflow: 'visible' }}>
          <div style={{ padding: '16px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>Grow your network</h2>
            <p className="hint" style={{ marginTop: 0, fontSize: '14px', marginBottom: '16px' }}>Find people you know by searching for their name.</p>
            
            <div className="search-input-wrap" style={{ position: 'relative', display: 'flex', gap: '12px', alignItems: 'center' }}>
              <input
                type="text"
                value={toName}
                onChange={e => { setToName(e.target.value); if(!e.target.value) setToId('') }}
                placeholder="Search by name..."
                className="search-bar-input"
                style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '14px' }}
              />
              <button type="button" className="primary" onClick={sendRequest} disabled={reqLoading || !toId} style={{ borderRadius: '24px', padding: '6px 16px', fontSize: '16px' }}>
                {reqLoading ? 'Sending...' : 'Connect'}
              </button>
              
              {toResults.length > 0 && !toId && (
                <div className="search-dropdown panel" style={{ position: 'absolute', top: '100%', left: 0, right: '100px', zIndex: 10, background: '#fff', border: '1px solid var(--border)', borderRadius: '0 0 4px 4px', boxShadow: 'var(--sh-drop)' }}>
                  {toResults.map(m => (
                    <div key={m.member_id} className="search-item" style={{ padding: '12px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }} onClick={() => { 
                      setToId(String(m.member_id)); 
                      setToName(`${m.first_name} ${m.last_name}`);
                      setToResults([]);
                    }}>
                      <div className="search-item-info">
                        <div className="search-item-name" style={{ fontWeight: 600, fontSize: '14px' }}>{m.first_name} {m.last_name}</div>
                        <div className="search-item-headline" style={{ fontSize: '12px', color: 'var(--text-sec)' }}>{m.headline}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {reqResult && (
              <ResultBanner success={reqResult.success} message={reqResult.message} />
            )}
          </div>
        </div>

        {/* My connections */}
        <div id="conns-section" className="li-card">
          <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>My connections</h2>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <input 
                type="text" 
                placeholder="Search connections..." 
                value={connsFilter}
                onChange={e => setConnsFilter(e.target.value)}
                className="search-bar-input"
                style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '14px' }}
              />
              <button type="button" className="ghost-btn" onClick={() => loadConnections(myId!)} disabled={connsLoading} style={{ fontSize: '14px' }}>
                {connsLoading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>
          
          <div style={{ padding: '16px' }}>
            {connsErr && <p className="error">{connsErr}</p>}
            {connections.length === 0 && !connsLoading && (
              <p className="hint">You don't have any connections yet.</p>
            )}
            {filteredConnections.length === 0 && connections.length > 0 && (
              <p className="hint">No matches for "{connsFilter}".</p>
            )}
            {filteredConnections.length > 0 && (
              <ul className="conn-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {filteredConnections.map(c => {
                  const m = c.connected_member
                  return (
                    <li key={c.connection_id} className="conn-item" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                        <div 
                          className="member-avatar" 
                          style={{ width: 48, height: 48, minWidth: 48, minHeight: 48, fontSize: 20, background: '#0a66c2', flexShrink: 0, cursor: 'pointer', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', lineHeight: 1 }}
                          onClick={() => {
                            const otherId = c.requester_id === myId ? c.receiver_id : c.requester_id
                            onNavigateProfile?.(otherId)
                          }}
                        >
                          {(m?.name ?? '?')[0].toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div 
                            className="conn-item-name" 
                            style={{ cursor: 'pointer', fontWeight: 600, fontSize: '16px', color: 'var(--text)' }}
                            onClick={() => {
                              const otherId = c.requester_id === myId ? c.receiver_id : c.requester_id
                              onNavigateProfile?.(otherId)
                            }}
                          >
                            {m ? m.name : `Member #${c.requester_id === myId ? c.receiver_id : c.requester_id}`}
                          </div>
                          {m?.headline && <div className="conn-item-headline muted" style={{ fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.headline}</div>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                        <button 
                          className="ghost-btn" 
                          style={{ color: '#d11124', fontSize: '14px', fontWeight: 600, padding: '6px 12px' }}
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
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

      </div>
    </div>
  </div>
  )
}
