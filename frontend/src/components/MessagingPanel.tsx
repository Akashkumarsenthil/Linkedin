/**
 * MessagingPanel — LinkedIn-style 2-column messaging UI.
 * Uses the stored JWT token for sender identity.
 */
import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { apiGet, apiPost, parseStoredUser } from '../api'

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

/** Normalize bare MySQL timestamps (no timezone) to UTC */
function toUTC(iso: string): string {
  if (!iso) return ''
  let s = iso.trim()
  if (!s.includes('T')) s = s.replace(' ', 'T')
  // If no timezone indicator exists, and we know our server is now in PST or we want to treat it as UTC
  // Given we set TZ=America/Los_Angeles in docker, bare strings might be PST.
  // But standard practice is to send UTC. We'll assume UTC if no offset.
  if (!s.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(s)) {
    s += 'Z'
  }
  return s
}

function fmtTime(iso: string): string {
  try {
    const d = new Date(toUTC(iso))
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit',
      timeZone: 'America/Los_Angeles'
    })
  } catch { return iso }
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(toUTC(iso))
    const today = new Date()
    const pstOpts: Intl.DateTimeFormatOptions = { timeZone: 'America/Los_Angeles' }
    const dStr = d.toLocaleDateString('en-US', pstOpts)
    const tStr = today.toLocaleDateString('en-US', pstOpts)
    if (dStr === tStr) return fmtTime(iso)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' })
  } catch { return iso }
}

function tryParseSharedPost(text: string): { type: string; post_id: number; author_name?: string; author_headline?: string; author_photo_url?: string; content?: string; image_url?: string; created_at?: string } | null {
  // New JSON format
  try {
    const parsed = JSON.parse(text)
    if (parsed && parsed.type === 'shared_post') return parsed
    return null
  } catch { /* not JSON, try old format */ }

  // Old plain text format: "Check out this post: http://.../posts/123"
  const match = text.match(/Check out this post:\s*https?:\/\/[^/]+\/posts\/(\d+)/)
  if (match) {
    return { type: 'shared_post', post_id: parseInt(match[1]) }
  }

  return null
}

function SharedPostLoader({ 
  sharedPost, 
  onNavigatePost 
}: { 
  sharedPost: NonNullable<ReturnType<typeof tryParseSharedPost>>, 
  onNavigatePost?: (id: number) => void 
}) {
  const [postData, setPostData] = useState<any>(sharedPost)

  useEffect(() => {
    // If it doesn't have an image_url but we know we can fetch it, let's try to get full data
    // Or just always fetch to ensure it's up to date.
    let mounted = true
    apiGet(`/posts/${sharedPost.post_id}`).then((res: any) => {
      if (mounted && res?.data) {
        setPostData({
          ...sharedPost,
          author_name: res.data.author?.name || sharedPost.author_name,
          author_headline: res.data.author?.headline || sharedPost.author_headline,
          author_photo_url: res.data.author?.photo_url || sharedPost.author_photo_url,
          content: res.data.content || sharedPost.content,
          image_url: res.data.image_url || sharedPost.image_url,
        })
      }
    }).catch(() => {})
    return () => { mounted = false }
  }, [sharedPost.post_id])

  const hasFullData = !!(postData.author_name || postData.content)
  
  return (
    <div 
      className="shared-post-card" 
      onClick={() => onNavigatePost && onNavigatePost(postData.post_id)}
      style={{ cursor: onNavigatePost ? 'pointer' : 'default' }}
    >
      <div className="shared-post-header">
        <div className="shared-post-avatar">
          {postData.author_photo_url ? (
            <img src={postData.author_photo_url} alt="" />
          ) : (
            <span>{hasFullData ? (postData.author_name?.[0] || '?') : '📄'}</span>
          )}
        </div>
        <div className="shared-post-author">
          <span className="shared-post-name">
            {hasFullData ? postData.author_name : 'Shared Post'}
          </span>
          {postData.author_headline && (
            <span className="shared-post-headline">{postData.author_headline}</span>
          )}
          {!hasFullData && (
            <span className="shared-post-headline">Post #{postData.post_id}</span>
          )}
          {postData.created_at && (
            <span className="shared-post-time">{fmtDate(postData.created_at)}</span>
          )}
        </div>
      </div>
      {postData.content && (
        <p className="shared-post-content">{postData.content}</p>
      )}
      {postData.image_url && (
        <img className="shared-post-image" src={postData.image_url} alt="Post" />
      )}
    </div>
  )
}

export function MessagingPanel({ 
onNavigateProfile, onNavigatePost, targetUserId, onClearTarget }: { onNavigateProfile?: (id: number) => void, onNavigatePost?: (postId: number) => void, targetUserId?: number | null, onClearTarget?: () => void }) {
  const identity = useMemo(() => parseStoredUser(), [])

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
  const [newParticipant, setNewPart]  = useState('')
  const [newParticType, setNewPType]  = useState<UserType>('member')
  const [newLoading, setNewL]         = useState(false)
  const [newErr, setNewErr]           = useState<string | null>(null)
  
  const [searchName, setSearchName] = useState('')
  const [searchResults, setSearchResults] = useState<{ id: number; name: string; headline: string; type: UserType }[]>([])

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
        { participant_ids: [
            { user_id: identity.user_id, user_type: identity.user_type },
            { user_id: otherId, user_type: newParticType },
          ] },
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
          Signed in as <strong>{identity.email}</strong> ({identity.user_type})
        </p>
      </div>

      <div className="msg-layout" style={{ borderTop: '4px solid var(--ln-blue, #0a66c2)', height: '650px' }}>
        {/* ── Thread list ──────────────────────────────── */}
        <div className="msg-sidebar" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
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

          {/* New thread moved to TOP */}
          <div className="new-thread-section" style={{ padding: '8px 14px', borderBottom: '1px solid #eee' }}>
            <button type="button" className="ghost-btn full-width" style={{ textAlign: 'left', fontWeight: 600, color: 'var(--ln-blue)' }} onClick={() => setShowNew(v => !v)}>
              {showNew ? '✕ Cancel' : '+ New conversation'}
            </button>
            {showNew && (
              <div className="new-thread-form" style={{ marginTop: 10 }}>
                <label className="form-label" style={{ position: 'relative' }}>
                  Recipient
                  <div className="search-input-wrap">
                    <input
                      type="text"
                      value={searchName}
                      onChange={e => { setSearchName(e.target.value); if(!e.target.value) setNewPart('') }}
                      placeholder="Search by name..."
                      className="search-bar-input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                    {searchResults.length > 0 && !newParticipant && (
                      <div className="search-dropdown panel" style={{ 
                        zIndex: 100, 
                        position: 'absolute', 
                        width: '100%', 
                        maxHeight: '400px', 
                        overflowY: 'auto',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                        marginTop: '4px',
                        background: '#fff',
                        left: 0,
                        right: 0
                      }}>
                        {searchResults.map(m => (
                          <div key={`${m.type}-${m.id}`} className="search-item" style={{ padding: '12px 14px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }} onClick={() => { 
                            setNewPart(String(m.id))
                            setNewPType(m.type)
                            setSearchName(`${m.name}`) 
                            setSearchResults([])
                          }}>
                            <div className="search-item-info">
                              <div className="search-item-name" style={{ fontWeight: 600, color: '#333' }}>{m.name}</div>
                              <div className="search-item-headline" style={{ fontSize: '12px', color: '#666' }}>{m.headline}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </label>
                {newErr && <p className="error" style={{ fontSize: 12, marginTop: 4 }}>{newErr}</p>}
                <button type="button" className="primary full-width" style={{ marginTop: 10 }} onClick={openThread} disabled={newLoading || !newParticipant}>
                  {newLoading ? 'Creating…' : 'Start conversation'}
                </button>
              </div>
            )}
          </div>

          {threadsErr && <p className="error" style={{ padding: '8px 14px', fontSize: 12 }}>{threadsErr}</p>}

          <ul className="thread-list" style={{ flex: 1, overflowY: 'auto' }}>
            {threads.length === 0 && !threadsLoading && (
              <li style={{ padding: '16px 14px' }}>
                <p className="hint">No conversations yet.</p>
              </li>
            )}
            {threads.map(t => (
              <li
                key={t.thread_id}
                className={`thread-item${selectedId === t.thread_id ? ' active' : ''}${t.unread_count > 0 ? ' unread' : ''}`}
                onClick={() => selectThread(t.thread_id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && selectThread(t.thread_id)}
                style={t.unread_count > 0 ? { borderLeft: '4px solid #cc1016', background: '#fff9f9' } : {}}
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
                    <div className="unread-dot" style={{ position: 'absolute', top: -2, right: -2, width: 10, height: 10, background: '#cc1016', borderRadius: '50%', border: '2px solid white' }} />
                  )}
                </div>
                <div className="thread-info">
                  <div className="thread-top">
                    <span 
                      className="thread-subject" 
                      style={t.unread_count > 0 ? { fontWeight: 800, color: '#000', cursor: 'pointer' } : { cursor: 'pointer' }}
                      onClick={(e) => {
                        if (t.other_participant) {
                          e.stopPropagation()
                          onNavigateProfile?.(t.other_participant.user_id)
                        }
                      }}
                    >
                      {t.other_participant?.name || t.subject || `Thread #${t.thread_id}`}
                    </span>
                    <span className="thread-date" style={t.unread_count > 0 ? { color: '#cc1016', fontWeight: 600 } : {}}>{fmtDate(t.created_at)}</span>
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
              </li>
            ))}
          </ul>
        </div>

        {/* ── Message area ─────────────────────────────── */}
        <div className="msg-main" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          {!selectedId ? (
            <div className="msg-empty">
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <p>Select a conversation to read messages</p>
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
                      <div className={`msg-bubble${isMe ? ' msg-bubble-me' : ''}`}>
                        {!isMe && (
                          <span className="msg-sender">{selectedThread?.other_participant?.name || `${m.sender_type}`}</span>
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
