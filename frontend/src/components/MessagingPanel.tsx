/**
 * MessagingPanel — demo UI for threads and messages.
 *
 * No auth system exists, so the user declares their own identity
 * (user_id + user_type) at the top of the panel.  That identity is
 * passed as sender_id/sender_type on every message send, and as
 * user_id/user_type when listing threads.
 */
import { useState, useRef, useEffect } from 'react'
import { apiPost } from '../api'

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MessagingPanel() {
  // ── identity (replaces auth) ──────────────────────────
  const [myId, setMyId]     = useState('1')
  const [myType, setMyType] = useState<UserType>('member')
  const [identity, setIdentity] = useState<{ id: number; type: UserType } | null>(null)

  // ── thread list ───────────────────────────────────────
  const [threads, setThreads]           = useState<ThreadData[]>([])
  const [threadsLoading, setThreadsL]   = useState(false)
  const [threadsErr, setThreadsErr]     = useState<string | null>(null)

  // ── selected thread / messages ────────────────────────
  const [selectedId, setSelectedId]     = useState<number | null>(null)
  const [messages, setMessages]         = useState<MsgData[]>([])
  const [msgsLoading, setMsgsL]         = useState(false)
  const [msgsErr, setMsgsErr]           = useState<string | null>(null)

  // ── compose ───────────────────────────────────────────
  const [msgText, setMsgText]           = useState('')
  const [sendLoading, setSendL]         = useState(false)
  const [sendErr, setSendErr]           = useState<string | null>(null)

  // ── new thread form ───────────────────────────────────
  const [showNew, setShowNew]           = useState(false)
  const [newSubject, setNewSubject]     = useState('')
  const [newParticipant, setNewParticipant] = useState('')
  const [newParticType, setNewParticT]  = useState<UserType>('member')
  const [newLoading, setNewL]           = useState(false)
  const [newErr, setNewErr]             = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)

  // scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── actions ───────────────────────────────────────────

  function applyIdentity() {
    const id = parseInt(myId, 10)
    if (!id || id < 1) return
    setIdentity({ id, type: myType })
    setThreads([])
    setMessages([])
    setSelectedId(null)
  }

  async function loadThreads(id: number, type: UserType) {
    setThreadsL(true)
    setThreadsErr(null)
    try {
      const r = await apiPost<{ success: boolean; message: string; data: ThreadData[] }>(
        '/threads/byUser',
        { user_id: id, user_type: type, page: 1, page_size: 30 },
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
      const r = await apiPost<{ success: boolean; message: string; data: MsgData[]; total: number }>(
        '/messages/list',
        { thread_id: threadId, page: 1, page_size: 50 },
      )
      if (!r.success) throw new Error(r.message)
      // API returns newest-first; reverse so oldest is at top (chat style)
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
        {
          thread_id: selectedId,
          sender_id: identity.id,
          sender_type: identity.type,
          message_text: msgText.trim(),
        },
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
    if (!otherId || otherId < 1) {
      setNewErr('Enter a valid participant ID')
      return
    }
    setNewL(true)
    setNewErr(null)
    try {
      const participants = [
        { user_id: identity.id, user_type: identity.type },
        { user_id: otherId, user_type: newParticType },
      ]
      const r = await apiPost<{ success: boolean; message: string; data: ThreadData }>(
        '/threads/open',
        { participant_ids: participants, subject: newSubject || undefined },
      )
      if (!r.success) throw new Error(r.message)
      setShowNew(false)
      setNewSubject('')
      setNewParticipant('')
      // Refresh thread list and select the new thread
      await loadThreads(identity.id, identity.type)
      setSelectedId(r.data.thread_id)
      setMessages([])
    } catch (e) {
      setNewErr(e instanceof Error ? e.message : 'Failed to open thread')
    } finally {
      setNewL(false)
    }
  }

  const selectedThread = threads.find(t => t.thread_id === selectedId)

  // ── render ────────────────────────────────────────────

  return (
    <section className="panel">
      <h2>Messaging</h2>

      {/* Identity bar */}
      <div className="identity-bar">
        <span className="identity-label">You are:</span>
        <input
          type="number"
          value={myId}
          min={1}
          onChange={e => setMyId(e.target.value)}
          style={{ width: 70 }}
          placeholder="ID"
        />
        <select
          value={myType}
          onChange={e => setMyType(e.target.value as UserType)}
          className="identity-select"
        >
          <option value="member">member</option>
          <option value="recruiter">recruiter</option>
        </select>
        <button
          type="button"
          className="primary"
          onClick={applyIdentity}
        >
          Set identity
        </button>
        {identity && (
          <span className="identity-badge">
            {identity.type} #{identity.id}
          </span>
        )}
      </div>

      {!identity && (
        <p className="hint">Set your user ID above to load threads.</p>
      )}

      {identity && (
        <div className="msg-layout">
          {/* ── Thread list ──────────────────────────── */}
          <div className="msg-sidebar">
            <div className="msg-sidebar-header">
              <span className="sidebar-title">Threads</span>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => loadThreads(identity.id, identity.type)}
                disabled={threadsLoading}
                title="Refresh threads"
              >
                {threadsLoading ? '…' : '↺'}
              </button>
            </div>

            {threadsErr && <p className="error" style={{ padding: '0 0.75rem' }}>{threadsErr}</p>}

            {threads.length === 0 && !threadsLoading && (
              <p className="hint" style={{ padding: '0.5rem 0.75rem' }}>
                No threads yet. Use "New thread" to start one.
              </p>
            )}

            <ul className="thread-list">
              {threads.map(t => (
                <li
                  key={t.thread_id}
                  className={`thread-item${selectedId === t.thread_id ? ' active' : ''}`}
                  onClick={() => selectThread(t.thread_id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && selectThread(t.thread_id)}
                >
                  <span className="thread-subject">
                    {t.subject || `Thread #${t.thread_id}`}
                  </span>
                  {t.last_message && (
                    <span className="thread-preview">
                      {t.last_message.message_text.slice(0, 40)}
                      {t.last_message.message_text.length > 40 ? '…' : ''}
                    </span>
                  )}
                  <span className="thread-date">{fmtDate(t.created_at)}</span>
                </li>
              ))}
            </ul>

            {/* New thread toggle */}
            <div className="new-thread-section">
              <button
                type="button"
                className="ghost-btn full-width"
                onClick={() => setShowNew(v => !v)}
              >
                {showNew ? '✕ Cancel' : '+ New thread'}
              </button>

              {showNew && (
                <div className="new-thread-form">
                  <label className="form-label">
                    Subject (optional)
                    <input
                      value={newSubject}
                      onChange={e => setNewSubject(e.target.value)}
                      placeholder="e.g. Job inquiry"
                    />
                  </label>
                  <label className="form-label">
                    Other participant ID
                    <input
                      type="number"
                      value={newParticipant}
                      min={1}
                      onChange={e => setNewParticipant(e.target.value)}
                      placeholder="e.g. 2"
                    />
                  </label>
                  <label className="form-label">
                    Their type
                    <select
                      value={newParticType}
                      onChange={e => setNewParticT(e.target.value as UserType)}
                      className="identity-select"
                    >
                      <option value="member">member</option>
                      <option value="recruiter">recruiter</option>
                    </select>
                  </label>
                  {newErr && <p className="error">{newErr}</p>}
                  <button
                    type="button"
                    className="primary"
                    onClick={openThread}
                    disabled={newLoading}
                  >
                    {newLoading ? 'Opening…' : 'Open thread'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Message area ─────────────────────────── */}
          <div className="msg-main">
            {!selectedId && (
              <div className="msg-empty">
                <p>Select a thread to view messages.</p>
              </div>
            )}

            {selectedId && (
              <>
                <div className="msg-thread-header">
                  <span className="thread-subject">
                    {selectedThread?.subject || `Thread #${selectedId}`}
                  </span>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => selectThread(selectedId)}
                    disabled={msgsLoading}
                    title="Refresh messages"
                  >
                    {msgsLoading ? '…' : '↺'}
                  </button>
                </div>

                {msgsErr && <p className="error" style={{ padding: '0.5rem 1rem' }}>{msgsErr}</p>}

                <div className="msg-body">
                  {messages.length === 0 && !msgsLoading && (
                    <p className="hint" style={{ padding: '1rem' }}>No messages yet.</p>
                  )}
                  {messages.map(m => {
                    const isMe = m.sender_id === identity.id && m.sender_type === identity.type
                    return (
                      <div key={m.message_id} className={`msg-bubble-row${isMe ? ' me' : ''}`}>
                        <div className={`msg-bubble${isMe ? ' msg-bubble-me' : ''}`}>
                          {!isMe && (
                            <span className="msg-sender">
                              {m.sender_type} #{m.sender_id}
                            </span>
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
                  {sendErr && <p className="error" style={{ marginBottom: '0.4rem' }}>{sendErr}</p>}
                  <div className="msg-compose-row">
                    <input
                      className="msg-input"
                      value={msgText}
                      onChange={e => setMsgText(e.target.value)}
                      placeholder="Type a message…"
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                      disabled={sendLoading}
                    />
                    <button
                      type="button"
                      className="primary"
                      onClick={sendMessage}
                      disabled={sendLoading || !msgText.trim()}
                    >
                      {sendLoading ? '…' : 'Send'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
