/**
 * MessagingPanel — LinkedIn-style 2-column messaging UI.
 * Uses the stored JWT token for sender identity.
 */
import { useState, useRef, useEffect } from 'react'
import { apiPost, parseStoredUser } from '../api'

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

  const [showNew, setShowNew]         = useState(false)
  const [newSubject, setNewSubject]   = useState('')
  const [newParticipant, setNewPart]  = useState('')
  const [newParticType, setNewPType]  = useState<UserType>('member')
  const [newLoading, setNewL]         = useState(false)
  const [newErr, setNewErr]           = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-load threads when component mounts if identity is available
  useEffect(() => {
    if (identity) loadThreads(identity.user_id, identity.user_type)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        '/messages/list', { thread_id: threadId, page: 1, page_size: 50 },
      )
      if (!r.success) throw new Error(r.message)
      setMessages((r.data ?? []).slice().reverse())
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
        { thread_id: selectedId, sender_id: identity.user_id, sender_type: identity.user_type, message_text: msgText.trim() },
      )
      if (!r.success) throw new Error(r.message)
      setMessages(prev => [...prev, r.data])
      setMsgText('')
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : 'Failed to send message')
    } finally {
      setSendL(false)
    }
  }

  async function openThread() {
    if (!identity) return
    const otherId = parseInt(newParticipant, 10)
    if (!otherId || otherId < 1) { setNewErr('Enter a valid participant ID'); return }
    setNewL(true)
    setNewErr(null)
    try {
      const r = await apiPost<{ success: boolean; message: string; data: ThreadData }>(
        '/threads/open',
        { participant_ids: [
            { user_id: identity.user_id, user_type: identity.user_type },
            { user_id: otherId, user_type: newParticType },
          ], subject: newSubject || undefined },
      )
      if (!r.success) throw new Error(r.message)
      setShowNew(false)
      setNewSubject('')
      setNewPart('')
      await loadThreads(identity.user_id, identity.user_type)
      setSelectedId(r.data.thread_id)
      setMessages([])
    } catch (e) {
      setNewErr(e instanceof Error ? e.message : 'Failed to open thread')
    } finally {
      setNewL(false)
    }
  }

  const selectedThread = threads.find(t => t.thread_id === selectedId)

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
                <span className="thread-subject">{t.subject || `Thread #${t.thread_id}`}</span>
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
            <button type="button" className="ghost-btn full-width" onClick={() => setShowNew(v => !v)}>
              {showNew ? '✕ Cancel' : '+ New conversation'}
            </button>
            {showNew && (
              <div className="new-thread-form">
                <label className="form-label">
                  Subject (optional)
                  <input value={newSubject} onChange={e => setNewSubject(e.target.value)} placeholder="e.g. Job inquiry" />
                </label>
                <label className="form-label">
                  Recipient ID
                  <input type="number" value={newParticipant} min={1} onChange={e => setNewPart(e.target.value)} placeholder="e.g. 2" />
                </label>
                <label className="form-label">
                  Recipient type
                  <select value={newParticType} onChange={e => setNewPType(e.target.value as UserType)} className="identity-select">
                    <option value="member">member</option>
                    <option value="recruiter">recruiter</option>
                  </select>
                </label>
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
                <span className="thread-subject">{selectedThread?.subject || `Thread #${selectedId}`}</span>
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
