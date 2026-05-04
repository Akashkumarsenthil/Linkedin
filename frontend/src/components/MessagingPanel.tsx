/**
 * MessagingPanel — LinkedIn-style 2-column messaging UI.
 * Uses the stored JWT token for sender identity.
 */
import { useState, useRef, useEffect, useMemo } from 'react'
import { apiGet, apiPost, parseStoredUser } from '../api'
import { Icon } from './Icon'

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
  unread_count: number
  last_message?: MsgData
  other_participant?: {
    name: string
    photo_url?: string
    headline?: string
    user_id: number
    user_type: string
  }
}

type UserType = 'member' | 'recruiter'

function fmtDate(d: string) {
  const dt = new Date(d)
  const now = new Date()
  if (dt.toDateString() === now.toDateString()) return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return dt.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function tryParseSharedPost(text: string) {
  if (text.startsWith('{"type":"shared_post"')) {
    try { return JSON.parse(text) } catch { return null }
  }
  return null
}

function SharedPostLoader({ sharedPost, onNavigatePost }: { sharedPost: any, onNavigatePost?: (postId: number) => void }) {
  const [postData, setPostData] = useState<any>(null)
  useEffect(() => {
    apiPost<{ data: any }>('/posts/get', { post_id: sharedPost.postId || sharedPost.post_id }).then(r => setPostData(r.data)).catch(() => { })
  }, [sharedPost.postId, sharedPost.post_id])

  if (!postData) return <div className="hint" style={{ padding: '12px', border: '1px solid #eee', borderRadius: '8px' }}>Loading shared post...</div>

  return (
    <div
      className="shared-post-card"
      onClick={() => onNavigatePost?.(postData.post_id)}
      style={{ border: '1px solid var(--li-border)', borderRadius: '8px', overflow: 'hidden', background: '#fff', cursor: 'pointer', maxWidth: '300px' }}
    >
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #eee', fontSize: '12px', fontWeight: 600 }}>
        {postData.author_name}
      </div>
      <p style={{ padding: '8px 12px', margin: 0, fontSize: '13px' }}>{postData.content?.slice(0, 80)}...</p>
      {postData.image_url && (
        <img className="shared-post-image" src={postData.image_url} alt="Post" />
      )}
    </div>
  )
}

export function MessagingPanel({
  onNavigateProfile, onNavigatePost, targetUserId, onClearTarget }: { onNavigateProfile?: (id: number) => void, onNavigatePost?: (postId: number) => void, targetUserId?: number | null, onClearTarget?: () => void }) {
  const identity = useMemo(() => parseStoredUser(), [])

  const [threads, setThreads] = useState<ThreadData[]>([])
  const [threadsLoading, setThreadsL] = useState(false)
  const [threadsErr, setThreadsErr] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [messages, setMessages] = useState<MsgData[]>([])
  const [msgsLoading, setMsgsL] = useState(false)
  const [msgsErr, setMsgsErr] = useState<string | null>(null)

  const [msgText, setMsgText] = useState('')
  const [sendLoading, setSendL] = useState(false)
  const [sendErr, setSendErr] = useState<string | null>(null)

  const [threadSearch, setThreadSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newParticipant, setNewPart] = useState('')
  const [newParticType, setNewPType] = useState<UserType>('member')
  const [newLoading, setNewL] = useState(false)
  const [newErr, setNewErr] = useState<string | null>(null)

  const [searchName, setSearchName] = useState('')
  const [searchResults, setSearchResults] = useState<{ id: number; name: string; headline: string; type: UserType }[]>([])

  const filteredThreads = useMemo(() => {
    if (!threadSearch.trim()) return threads
    const term = threadSearch.toLowerCase()
    return threads.filter(t =>
      t.other_participant?.name?.toLowerCase().includes(term) ||
      t.subject?.toLowerCase().includes(term) ||
      t.last_message?.message_text?.toLowerCase().includes(term)
    )
  }, [threads, threadSearch])

  useEffect(() => {
    // Clear results immediately when typing starts
    if (searchName.length < 2) {
      setSearchResults([])
    }

    const t = setTimeout(async () => {
      if (searchName.length < 2) return
      try {
        const [mRes, rRes] = await Promise.all([
          apiPost<{ data: any[] }>('/members/search', { keyword: searchName, page_size: 20 }).catch(() => ({ data: [] })),
          apiPost<{ data: any[] }>('/recruiters/search', { keyword: searchName, page_size: 20 }).catch(() => ({ data: [] }))
        ])
        const mData = (mRes.data || []).map(m => ({ id: m.member_id, name: `${m.first_name} ${m.last_name}`, headline: m.headline || 'Member', type: 'member' as UserType }))
        const rData = (rRes.data || []).map(r => ({ id: r.user_id, name: `${r.first_name} ${r.last_name}`, headline: r.company_name || r.company || 'Recruiter', type: 'recruiter' as UserType }))
        setSearchResults([...mData, ...rData])
      } catch {
        setSearchResults([])
      }
    }, 250) // Slightly faster debounce
    return () => clearTimeout(t)
  }, [searchName])

  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Track whether we've already handled a given targetUserId to prevent loops
  const handledTargetRef = useRef<number | null>(null)

  // Auto-load threads when component mounts
  useEffect(() => {
    if (identity?.user_id && identity?.user_type) {
      loadThreads(identity.user_id, identity.user_type)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Run once on mount

  // Handle targetUserId for direct messaging from profile
  useEffect(() => {
    if (!targetUserId || !identity || handledTargetRef.current === targetUserId) return
    handledTargetRef.current = targetUserId

    async function handleTarget() {
      // First reload threads to get latest state
      const freshThreads = await apiPost<{ success: boolean; data: ThreadData[] }>(
        '/threads/byUser', { user_id: identity!.user_id, user_type: identity!.user_type, page: 1, page_size: 30 }
      )
      const threadList = freshThreads.data ?? []
      setThreads(threadList)

      // Check if thread already exists with the target user
      const existing = threadList.find(t => t.other_participant?.user_id === targetUserId)
      if (existing) {
        selectThread(existing.thread_id)
        onClearTarget?.()
        return
      }

      // Create new thread
      try {
        const res = await apiPost<{ success: boolean; data: ThreadData }>('/threads/open', {
          participant_ids: [
            { user_id: identity!.user_id, user_type: identity!.user_type },
            { user_id: targetUserId, user_type: 'member' }
          ]
        })
        if (res.success) {
          // Reload threads to include the new one
          const updated = await apiPost<{ success: boolean; data: ThreadData[] }>(
            '/threads/byUser', { user_id: identity!.user_id, user_type: identity!.user_type, page: 1, page_size: 30 }
          )
          setThreads(updated.data ?? [])
          setSelectedId(res.data.thread_id)
        }
      } catch { /* thread creation may fail if not connected */ }
      onClearTarget?.()
    }
    handleTarget()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetUserId])

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
      // Clear unread highlight locally (backend already marks as read via /messages/list)
      setThreads(prev => prev.map(t =>
        t.thread_id === threadId ? { ...t, unread_count: 0 } : t
      ))
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
        {
          participant_ids: [
            { user_id: identity.user_id, user_type: identity.user_type },
            { user_id: otherId, user_type: newParticType },
          ]
        },
      )
      if (!r.success) throw new Error(r.message)
      setShowNew(false)
      setNewPart('')
      setSearchName('')
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
      <section className="messaging-page premium-panel">
        <header className="premium-header">
          <div>
            <h2 className="premium-title">Messages</h2>
            <p className="premium-subtitle">Manage your conversations and networking outreach.</p>
          </div>
        </header>
        <div className="auth-prompt-card" style={{ margin: '2rem' }}>
          <p className="auth-prompt-title">Sign in to access your messages</p>
          <p className="auth-prompt-sub">
            Connect with recruiters and professionals via private threads.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="panel premium-panel" style={{ marginTop: 16 }}>
      <header className="premium-header" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 className="premium-title">Messages</h2>
              <p className="premium-subtitle">
                Connected as <strong>{identity.name || identity.email}</strong>
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {showNew && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div style={{ position: 'relative', width: '300px' }}>
                    <input
                      type="text"
                      value={searchName}
                      onChange={e => { setSearchName(e.target.value); if (!e.target.value) setNewPart('') }}
                      placeholder="Type a name to start conversation..."
                      style={{ background: 'var(--li-search-bg)', border: '1px solid var(--li-border)', padding: '8px 12px', borderRadius: '8px', width: '100%', fontSize: '14px' }}
                    />
                    {searchResults.length > 0 && !newParticipant && (
                      <div className="search-dropdown panel" style={{
                        zIndex: 100, position: 'absolute', width: '100%', maxHeight: '300px', overflowY: 'auto',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.15)', marginTop: '4px', background: '#fff', left: 0, border: '1px solid var(--li-border)'
                      }}>
                        {searchResults.map(m => (
                          <div key={`${m.type}-${m.id}`} className="search-item" style={{ padding: '10px 14px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }} onClick={() => {
                            setNewPart(String(m.id)); setNewPType(m.type); setSearchName(m.name); setSearchResults([]); setNewErr(null);
                          }}>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</div>
                            <div style={{ fontSize: 11, color: '#666' }}>{m.headline}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button type="button" className="pill-btn" style={{ background: 'var(--li-green)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '16px', fontWeight: 600, cursor: 'pointer' }} onClick={openThread} disabled={newLoading || !newParticipant}>
                    {newLoading ? '...' : 'Start'}
                  </button>
                </div>
              )}
              <button
                type="button"
                className="pill-btn"
                style={{
                  height: '40px', padding: '0 20px',
                  background: showNew ? '#f3f6f8' : 'var(--li-green)',
                  color: showNew ? 'var(--li-text-primary)' : '#fff',
                  border: 'none', borderRadius: '20px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                  whiteSpace: 'nowrap'
                }}
                onClick={() => { setShowNew(v => !v); if (showNew) { setSearchName(''); setNewPart(''); setNewErr(null); } }}
                title={showNew ? 'Cancel' : 'New Message'}
              >
                {showNew ? <Icon name="close" size={18} /> : <Icon name="edit" size={18} />}
                <span>{showNew ? 'Cancel' : 'New Conversation'}</span>
              </button>
            </div>
          </div>
          {newErr && <p className="error" style={{ fontSize: 11, textAlign: 'right' }}>{newErr}</p>}
        </div>
      </header>

      <div style={{ padding: '0 24px 24px' }}>
        <div className="msg-layout">
          {/* ── Sidebar ──────────────────────────────── */}
          <div className="msg-sidebar">
            <div className="msg-sidebar-search">
              <input
                type="text"
                placeholder="Search messages..."
                value={threadSearch}
                onChange={e => setThreadSearch(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', background: 'var(--li-search-bg)', border: '1px solid var(--li-border)', borderRadius: '8px', fontSize: '14px' }}
              />
            </div>




            <div className="thread-list" style={{ overflowY: 'auto', flex: 1 }}>
              {filteredThreads.length === 0 && !threadsLoading && (
                <div style={{ padding: '24px', textAlign: 'center', color: '#999', fontSize: 13 }}>
                  No conversations found.
                </div>
              )}
              {filteredThreads.map(t => (
                <div
                  key={t.thread_id}
                  className={`thread-item${selectedId === t.thread_id ? ' active' : ''}${t.unread_count > 0 ? ' unread' : ''}`}
                  onClick={() => selectThread(t.thread_id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && selectThread(t.thread_id)}
                >
                  <div
                    className="thread-avatar"
                    style={{ position: 'relative', cursor: 'pointer' }}
                    onClick={(e) => {
                      if (t.other_participant) {
                        e.stopPropagation()
                        onNavigateProfile?.(t.other_participant.user_id)
                      }
                    }}
                  >
                    {t.other_participant?.photo_url ? (
                      <img src={t.other_participant.photo_url} alt="" />
                    ) : (
                      <div className="avatar-placeholder">{t.other_participant?.name?.[0] || '?'}</div>
                    )}
                    {t.unread_count > 0 && (
                      <div className="unread-dot" />
                    )}
                  </div>
                  <div className="thread-info">
                    <div className="thread-top">
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                        <span
                          className="thread-subject"
                          style={t.unread_count > 0 ? { fontWeight: 800, color: 'var(--li-blue-primary)', cursor: 'pointer', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', fontSize: '15px' } : { cursor: 'pointer', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', fontSize: '15px', color: 'var(--li-text-primary)' }}
                          onClick={(e) => {
                            if (t.other_participant) {
                              e.stopPropagation()
                              onNavigateProfile?.(t.other_participant.user_id)
                            }
                          }}
                        >
                          {t.other_participant?.name || t.subject || `Thread #${t.thread_id}`}
                        </span>
                        {t.other_participant?.headline && (
                          <span style={{ fontSize: '12px', color: 'var(--li-text-sec)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', marginTop: '2px' }}>
                            {t.other_participant.headline}
                          </span>
                        )}
                      </div>
                      <span className="thread-date" style={t.unread_count > 0 ? { color: '#cc1016', fontWeight: 600, flexShrink: 0 } : { flexShrink: 0 }}>{fmtDate(t.created_at)}</span>
                    </div>
                    {t.last_message && (
                      <span className="thread-preview" style={t.unread_count > 0 ? { fontWeight: 600, color: '#333' } : {}}>
                        {(() => {
                          const shared = tryParseSharedPost(t.last_message.message_text);
                          if (shared) {
                            const isMe = t.last_message.sender_id === identity?.user_id && t.last_message.sender_type === identity?.user_type;
                            return isMe ? "You shared a post" : `${t.other_participant?.name || 'Someone'} shared a post`;
                          }
                          return t.last_message.message_text.slice(0, 45) + (t.last_message.message_text.length > 45 ? '…' : '');
                        })()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>



          {/* ── Message area ─────────────────────────────── */}
          <div className="msg-main" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {!selectedId ? (
              <div className="msg-empty" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--li-text-sec)', textAlign: 'center', padding: '40px' }}>
                <Icon name="messaging" size={64} style={{ opacity: 0.2, marginBottom: '16px' }} />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <p style={{ fontSize: '18px', fontWeight: 500, margin: 0 }}>Select a conversation to read messages</p>
                  <p style={{ fontSize: '14px', margin: 0 }}>Connect with professionals and grow your network.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="msg-thread-header">
                  <div className="msg-header-info">
                    {selectedThread?.other_participant && (
                      <button
                        type="button"
                        className="msg-header-name"
                        onClick={() => onNavigateProfile?.(selectedThread.other_participant!.user_id)}
                      >
                        {selectedThread.other_participant.name}
                      </button>
                    )}
                    {selectedThread?.other_participant?.headline && (
                      <span className="msg-header-headline">{selectedThread.other_participant.headline}</span>
                    )}
                    {!selectedThread?.other_participant && (
                      <span className="thread-subject">{selectedThread?.subject || `Thread #${selectedId}`}</span>
                    )}
                  </div>
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

                <div className="msg-body" style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                  {messages.length === 0 && !msgsLoading && (
                    <p className="hint" style={{ textAlign: 'center', paddingTop: 24 }}>
                      No messages yet. Say hello!
                    </p>
                  )}
                  {messages.map(m => {
                    const isMe = m.sender_id === identity.user_id && m.sender_type === identity.user_type
                    const sharedPost = tryParseSharedPost(m.message_text)

                    if (sharedPost) {
                      return (
                        <div key={m.message_id} className={`msg-bubble-row${isMe ? ' me' : ''}`}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <SharedPostLoader sharedPost={sharedPost} onNavigatePost={onNavigatePost} />
                            <span className="msg-time">{fmtTime(m.timestamp)}</span>
                          </div>
                        </div>
                      )
                    }

                    return (
                      <div key={m.message_id} className={`msg-bubble-row${isMe ? ' me' : ''}`}>
                        {!isMe && (
                          <div className="msg-avatar" onClick={() => selectedThread?.other_participant && onNavigateProfile?.(selectedThread.other_participant.user_id)} style={{ cursor: 'pointer' }}>
                            {selectedThread?.other_participant?.photo_url ? (
                              <img src={selectedThread.other_participant.photo_url} alt="" />
                            ) : (
                              <div className="avatar-placeholder">{selectedThread?.other_participant?.name?.[0] || m.sender_type[0].toUpperCase()}</div>
                            )}
                          </div>
                        )}
                        <div className={`msg-bubble${isMe ? ' msg-bubble-me' : ''}`}>
                          {!isMe && (
                            <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 4 }}>
                              <span className="msg-sender" style={{ cursor: 'pointer' }} onClick={() => selectedThread?.other_participant && onNavigateProfile?.(selectedThread.other_participant.user_id)}>
                                {selectedThread?.other_participant?.name || `${m.sender_type}`}
                              </span>
                              {selectedThread?.other_participant?.headline && (
                                <span style={{ fontSize: '11px', color: 'var(--li-text-sec)', marginTop: -2 }}>
                                  {selectedThread.other_participant.headline}
                                </span>
                              )}
                            </div>
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
                  <div className="msg-compose-row" style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', background: '#fff', border: '1px solid var(--li-border)', borderRadius: '12px', padding: '12px 16px' }}>
                    <textarea
                      className="msg-input"
                      placeholder="Write a message..."
                      rows={1}
                      style={{ flex: 1, border: 'none', background: 'transparent', resize: 'none', padding: '4px 0', fontSize: '14px', outline: 'none' }}
                      value={msgText}
                      onChange={e => setMsgText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                    />
                    <button
                      className="circular-send-btn"
                      style={{
                        width: '40px', height: '40px',
                        background: 'var(--li-blue-primary)', color: '#fff',
                        border: 'none', borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', transition: 'all 0.2s',
                        opacity: sendLoading || !msgText.trim() ? 0.5 : 1
                      }}
                      onClick={sendMessage}
                      disabled={sendLoading || !msgText.trim()}
                    >
                      {sendLoading ? '...' : <Icon name="send" size={20} />}
                    </button>
                  </div>
                  {sendErr && <p className="error" style={{ fontSize: 11, marginTop: 4 }}>{sendErr}</p>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}



