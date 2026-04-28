/**
 * MessagingPanel — LinkedIn-style 2-column messaging UI.
 * Uses the stored JWT token for sender identity.
 */
import { useState, useRef, useEffect } from 'react'
import { apiPost, getStoredToken, parseStoredUser } from '../api'

interface MsgData {
  message_id: number
  sender_id: number
  sender_type: string
  message_text: string
  timestamp: string
}

interface ThreadData {
  thread_id: number
  subject: string | null
  created_at: string
  unread_count?: number
  recipient?: { user_id: number; user_type: UserType; name: string }
  is_group?: boolean
  participant_count?: number
  conversation_name?: string
  last_message?: MsgData
}

type UserType = 'member' | 'recruiter'

function fmtTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
  catch { return iso }
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso)
    const today = new Date()
    if (d.toDateString() === today.toDateString()) return fmtTime(iso)
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  } catch { return iso }
}

export function MessagingPanel() {
  const identity = parseStoredUser()

  const [threads, setThreads]         = useState<ThreadData[]>([])
  const [threadsLoading, setThreadsL] = useState(false)
  const [threadsErr, setThreadsErr]   = useState<string | null>(null)

  const [selectedId, setSelectedId]   = useState<number | null>(null)
  const [messages, setMessages]       = useState<MsgData[]>([])
  const [msgsLoading, setMsgsL]       = useState(false)
  const [msgsErr, setMsgsErr]         = useState<string | null>(null)

  const [msgText, setMsgText]         = useState('')
  const [sendLoading, setSendL]       = useState(false)
  const [sendErr, setSendErr]         = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const [showNew, setShowNew]         = useState(false)
  const [newSubject, setNewSubject]   = useState('')
  const [nameQuery, setNameQuery]     = useState('')
  const [nameSearchLoading, setNameSearchL] = useState(false)
  /** Last completed search keyword (trimmed); used so we show “No matches” only for current query. */
  const [nameSearchSettledFor, setNameSearchSettledFor] = useState<string | null>(null)
  const [nameSearchResults, setNameSearchResults] = useState<Array<{
    user_id: number
    user_type: UserType
    display_name: string
    subtitle?: string
  }>>([])
  const [newParticipants, setNewParticipants] = useState<Array<{ user_id: number; user_type: UserType; name?: string }>>([])
  const [newParticType, setNewPType]  = useState<UserType>('member')
  const [newLoading, setNewL]         = useState(false)
  const [newErr, setNewErr]           = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const nameSearchSeq = useRef(0)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-load threads when component mounts if identity is available
  useEffect(() => {
    if (identity) loadThreads(identity.user_id, identity.user_type)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const token = ++nameSearchSeq.current
    if (!showNew) {
      setNameSearchResults([])
      setNameSearchL(false)
      setNameSearchSettledFor(null)
      return
    }
    const q = nameQuery.trim()
    if (q.length < 2) {
      setNameSearchResults([])
      setNameSearchL(false)
      setNameSearchSettledFor(null)
      return
    }
    const timer = setTimeout(() => {
      void runNameSearch(q, token)
    }, 280)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameQuery, newParticType, showNew])

  async function runNameSearch(keyword: string, seq: number) {
    setNameSearchL(true)
    setNameSearchSettledFor(null)
    try {
      if (newParticType === 'member') {
        const r = await apiPost<{
          success: boolean
          message: string
          data?: Array<{
            member_id: number
            first_name: string
            last_name: string
            headline?: string | null
          }>
        }>('/members/search', { keyword, page: 1, page_size: 12 })
        if (!r.success) throw new Error(r.message)
        const rows = (r.data ?? []).map(m => ({
          user_id: m.member_id,
          user_type: 'member' as const,
          display_name: `${m.first_name} ${m.last_name}`.trim(),
          subtitle: m.headline || undefined,
        }))
        if (nameSearchSeq.current !== seq) return
        setNameSearchResults(
          rows.filter(h => !(identity && h.user_type === 'member' && h.user_id === identity.user_id)),
        )
      } else {
        const r = await apiPost<{
          success: boolean
          message: string
          data?: Array<{
            recruiter_id: number
            first_name: string
            last_name: string
            company_name?: string | null
          }>
        }>('/recruiters/search', { keyword, page_size: 12 })
        if (!r.success) throw new Error(r.message)
        const rows = (r.data ?? []).map(rec => ({
          user_id: rec.recruiter_id,
          user_type: 'recruiter' as const,
          display_name: `${rec.first_name} ${rec.last_name}`.trim(),
          subtitle: rec.company_name || undefined,
        }))
        if (nameSearchSeq.current !== seq) return
        setNameSearchResults(
          rows.filter(h => !(identity && h.user_type === 'recruiter' && h.user_id === identity.user_id)),
        )
      }
    } catch {
      if (nameSearchSeq.current === seq) setNameSearchResults([])
    } finally {
      if (nameSearchSeq.current === seq) {
        setNameSearchL(false)
        setNameSearchSettledFor(keyword)
      }
    }
  }

  function toggleNewConversation() {
    if (showNew) {
      setNewSubject('')
      setNameQuery('')
      setNameSearchResults([])
      setNameSearchSettledFor(null)
      setNewParticipants([])
      setNewErr(null)
    }
    setShowNew(v => !v)
  }

  function addParticipantFromSearch(hit: { user_id: number; user_type: UserType; display_name: string }) {
    if (identity && hit.user_id === identity.user_id && hit.user_type === identity.user_type) {
      setNewErr('You cannot add yourself')
      return
    }
    setNewErr(null)
    setNewParticipants(prev => {
      if (prev.some(p => p.user_id === hit.user_id && p.user_type === hit.user_type)) return prev
      return [...prev, { user_id: hit.user_id, user_type: hit.user_type, name: hit.display_name }]
    })
    setNameQuery('')
    setNameSearchResults([])
  }

  async function loadThreads(id: number, type: UserType) {
    setThreadsL(true)
    setThreadsErr(null)
    try {
      const r = await apiPost<{ success: boolean; message: string; data: ThreadData[] }>(
        '/threads/byUser', { user_id: id, user_type: type, page: 1, page_size: 30 },
      )
      if (!r.success) throw new Error(r.message)
      setThreads(r.data ?? [])
    } catch (e) {
      setThreadsErr(e instanceof Error ? e.message : 'Failed to load threads')
    } finally {
      setThreadsL(false)
    }
  }

  async function selectThread(threadId: number) {
    setSelectedId(threadId)
    setMsgsErr(null)
    setMsgsL(true)
    try {
      const r = await apiPost<{ success: boolean; message: string; data: MsgData[] }>(
        '/messages/list',
        {
          thread_id: threadId,
          viewer_id: identity?.user_id,
          viewer_type: identity?.user_type,
          mark_as_read: true,
          page: 1,
          page_size: 50,
        },
      )
      if (!r.success) throw new Error(r.message)
      setMessages((r.data ?? []).slice().reverse())
      setThreads(prev => prev.map(t => t.thread_id === threadId ? { ...t, unread_count: 0 } : t))
    } catch (e) {
      setMsgsErr(e instanceof Error ? e.message : 'Failed to load messages')
    } finally {
      setMsgsL(false)
    }
  }

  async function sendMessage() {
    if (!identity || !selectedId || !msgText.trim()) return
    setSendL(true)
    setSendErr(null)
    try {
      const r = await apiPost<{ success: boolean; message: string; data: MsgData }>(
        '/messages/send',
        {
          thread_id: selectedId,
          sender_id: identity.user_id,
          sender_type: identity.user_type,
          message_text: msgText.trim(),
          client_message_id: crypto.randomUUID(),
        },
      )
      if (!r.success) throw new Error(r.message)
      setMsgText('')
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : 'Failed to send message')
    } finally {
      setSendL(false)
    }
  }

  async function openThread() {
    if (!identity) return
    if (newParticipants.length === 0) { setNewErr('Add at least one participant'); return }
    setNewL(true)
    setNewErr(null)
    try {
      const r = await apiPost<{ success: boolean; message: string; data: ThreadData }>(
        '/threads/open',
        { participant_ids: [
            { user_id: identity.user_id, user_type: identity.user_type },
            ...newParticipants.map(p => ({ user_id: p.user_id, user_type: p.user_type })),
          ], subject: newSubject || undefined },
      )
      if (!r.success) throw new Error(r.message)
      setShowNew(false)
      setNewSubject('')
      setNameQuery('')
      setNameSearchResults([])
      setNameSearchSettledFor(null)
      setNewParticipants([])
      await loadThreads(identity.user_id, identity.user_type)
      setSelectedId(r.data.thread_id)
      setMessages([])
    } catch (e) {
      setNewErr(e instanceof Error ? e.message : 'Failed to open thread')
    } finally {
      setNewL(false)
    }
  }

  function removeParticipant(idx: number) {
    setNewParticipants(prev => prev.filter((_, i) => i !== idx))
  }

  const selectedThread = threads.find(t => t.thread_id === selectedId)

  useEffect(() => {
    if (!identity || !selectedId) return
    const token = getStoredToken()
    if (!token) return

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${window.location.host}/api/messages/ws/${selectedId}?token=${encodeURIComponent(token)}`)
    wsRef.current = ws

    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data)
        if (data.event === 'message.created' && data.message) {
          setMessages(prev => {
            if (prev.some(m => m.message_id === data.message.message_id)) return prev
            return [...prev, data.message]
          })
          setThreads(prev => prev.map(t => {
            if (t.thread_id !== selectedId) return t
            return {
              ...t,
              last_message: data.message,
              unread_count:
                data.message.sender_id === identity.user_id && data.message.sender_type === identity.user_type
                  ? (t.unread_count ?? 0)
                  : 0,
            }
          }))
        }
      } catch {
        // ignore malformed ws payload
      }
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [identity, selectedId])

  // Not logged in
  if (!identity) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Messaging</h2>
        </div>
        <div className="auth-prompt-card">
          <p className="auth-prompt-title">Sign in to access your messages</p>
          <p className="auth-prompt-sub">
            Connect with recruiters and professionals via private threads.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="panel-title">Messaging</h2>
        <p className="panel-subtitle">
          Signed in as{' '}
          <strong>{identity.user_type} #{identity.user_id}</strong> · {identity.email}
        </p>
      </div>

      <div className="msg-layout">
        {/* ── Thread list ──────────────────────────────── */}
        <div className="msg-sidebar">
          <div className="msg-sidebar-header">
            <span className="sidebar-title">Conversations</span>
            <button
              type="button"
              className="icon-btn"
              onClick={() => loadThreads(identity.user_id, identity.user_type)}
              disabled={threadsLoading}
              title="Refresh"
            >
              {threadsLoading ? '…' : '↺'}
            </button>
          </div>

          {threadsErr && <p className="error" style={{ padding: '8px 14px', fontSize: 12 }}>{threadsErr}</p>}

          <ul className="thread-list">
            {threads.length === 0 && !threadsLoading && (
              <li style={{ padding: '16px 14px' }}>
                <p className="hint">No conversations yet.</p>
              </li>
            )}
            {threads.map(t => (
              <li
                key={t.thread_id}
                className={`thread-item${selectedId === t.thread_id ? ' active' : ''}`}
                onClick={() => selectThread(t.thread_id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && selectThread(t.thread_id)}
              >
                <span className="thread-subject">{t.conversation_name || t.recipient?.name || t.subject || `Thread #${t.thread_id}`}</span>
                <span className="thread-subject" style={{ fontSize: 12, color: '#666' }}>
                  {t.is_group ? `Group · ${t.participant_count ?? 0} participants` : (t.subject || `Conversation #${t.thread_id}`)}
                </span>
                {(t.unread_count ?? 0) > 0 && (
                  <span className="conn-status" style={{ background: '#0a66c2', color: '#fff' }}>
                    {t.unread_count}
                  </span>
                )}
                {t.last_message && (
                  <span className="thread-preview">
                    {t.last_message.message_text.slice(0, 45)}{t.last_message.message_text.length > 45 ? '…' : ''}
                  </span>
                )}
                <span className="thread-date">{fmtDate(t.created_at)}</span>
              </li>
            ))}
          </ul>

          {/* New thread */}
          <div className="new-thread-section">
            <button type="button" className="ghost-btn full-width" onClick={toggleNewConversation}>
              {showNew ? '✕ Cancel' : '+ New conversation'}
            </button>
            {showNew && (
              <div className="new-thread-form">
                <label className="form-label">
                  Subject (optional)
                  <input value={newSubject} onChange={e => setNewSubject(e.target.value)} placeholder="e.g. Job inquiry" />
                </label>
                <label className="form-label">
                  Recipient type
                  <select
                    value={newParticType}
                    onChange={e => {
                      setNewPType(e.target.value as UserType)
                      setNameQuery('')
                      setNameSearchResults([])
                      setNameSearchSettledFor(null)
                    }}
                    className="identity-select"
                  >
                    <option value="member">member</option>
                    <option value="recruiter">recruiter</option>
                  </select>
                </label>
                <div className="form-label" style={{ position: 'relative' }}>
                  <span>Search by name</span>
                  <input
                    value={nameQuery}
                    onChange={e => setNameQuery(e.target.value)}
                    placeholder={newParticType === 'member' ? 'Type a member’s name…' : 'Name or company…'}
                    autoComplete="off"
                  />
                  {nameQuery.trim().length >= 2
                    && (nameSearchLoading || nameSearchSettledFor === nameQuery.trim()) && (
                    <ul className="search-dropdown li-card" style={{ marginTop: 0 }}>
                      {nameSearchLoading && (
                        <li className="dropdown-loading" style={{ listStyle: 'none' }}>Searching…</li>
                      )}
                      {!nameSearchLoading && nameSearchResults.map(hit => (
                        <li
                          key={`${hit.user_type}-${hit.user_id}`}
                          className="dropdown-item"
                          style={{ listStyle: 'none' }}
                          role="button"
                          tabIndex={0}
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => addParticipantFromSearch(hit)}
                          onKeyDown={e => e.key === 'Enter' && addParticipantFromSearch(hit)}
                        >
                          <div className="item-info">
                            <div className="item-title">{hit.display_name}</div>
                            <div className="item-subtitle" style={{ fontSize: 12, color: '#666' }}>
                              {newParticType === 'member' ? 'Member' : 'Recruiter'} · #{hit.user_id}
                              {hit.subtitle ? ` · ${hit.subtitle}` : ''}
                            </div>
                          </div>
                        </li>
                      ))}
                      {!nameSearchLoading && nameSearchResults.length === 0 && (
                        <li className="hint" style={{ listStyle: 'none', padding: '10px 16px' }}>No matches</li>
                      )}
                    </ul>
                  )}
                </div>
                <p className="hint" style={{ marginTop: 0, fontSize: 12 }}>
                  Pick someone from the list — their ID is filled in automatically.
                </p>
                {newParticipants.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {newParticipants.map((p, idx) => (
                      <span key={`${p.user_type}-${p.user_id}`} className="conn-status status-accepted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {p.name ? `${p.name} · #${p.user_id}` : `${p.user_type} #${p.user_id}`}
                        <button type="button" className="icon-btn" onClick={() => removeParticipant(idx)} style={{ width: 18, height: 18 }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                {newErr && <p className="error">{newErr}</p>}
                <button type="button" className="primary" onClick={openThread} disabled={newLoading}>
                  {newLoading ? 'Creating…' : 'Start conversation'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Message area ─────────────────────────────── */}
        <div className="msg-main">
          {!selectedId ? (
            <div className="msg-empty">
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <p>Select a conversation to read messages</p>
              </div>
            </div>
          ) : (
            <>
              <div className="msg-thread-header">
                <span className="thread-subject">
                  {selectedThread?.conversation_name || selectedThread?.recipient?.name || selectedThread?.subject || `Thread #${selectedId}`}
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => selectThread(selectedId)}
                  disabled={msgsLoading}
                  title="Refresh messages"
                >
                  {msgsLoading ? '…' : '↺'}
                </button>
              </div>

              {msgsErr && <p className="error" style={{ padding: '8px 16px' }}>{msgsErr}</p>}

              <div className="msg-body">
                {messages.length === 0 && !msgsLoading && (
                  <p className="hint" style={{ textAlign: 'center', paddingTop: 24 }}>
                    No messages yet. Say hello!
                  </p>
                )}
                {messages.map(m => {
                  const isMe = m.sender_id === identity.user_id && m.sender_type === identity.user_type
                  return (
                    <div key={m.message_id} className={`msg-bubble-row${isMe ? ' me' : ''}`}>
                      <div className={`msg-bubble${isMe ? ' msg-bubble-me' : ''}`}>
                        {!isMe && (
                          <span className="msg-sender">{m.sender_type} #{m.sender_id}</span>
                        )}
                        <span className="msg-text">{m.message_text}</span>
                        <span className="msg-time">{fmtTime(m.timestamp)}</span>
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>

              <div className="msg-compose">
                {sendErr && <p className="error" style={{ marginBottom: 6, fontSize: 12 }}>{sendErr}</p>}
                <div className="msg-compose-row">
                  <input
                    className="msg-input"
                    value={msgText}
                    onChange={e => setMsgText(e.target.value)}
                    placeholder="Write a message…"
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                    disabled={sendLoading}
                  />
                  <button
                    type="button"
                    className="primary"
                    onClick={sendMessage}
                    disabled={sendLoading || !msgText.trim()}
                    style={{ borderRadius: '50%', width: 36, height: 36, padding: 0, flexShrink: 0 }}
                  >
                    {sendLoading ? '…' : '→'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
