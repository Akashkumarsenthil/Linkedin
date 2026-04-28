/**
 * MessagingPanel — LinkedIn-style 2-column messaging UI.
 * Uses the stored JWT token for sender identity.
 */
import { useState, useRef, useEffect } from 'react'
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
  onNavigateProfile, 
  onNavigatePost, 
  initialTargetId, 
  initialTargetType, 
  onTargetConsumed 
}: { 
  onNavigateProfile?: (id: number) => void, 
  onNavigatePost?: (postId: number) => void,
  initialTargetId?: number | null,
  initialTargetType?: 'member' | 'recruiter',
  onTargetConsumed?: () => void 
} = {}) {
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

  const [recipientSearch, setRecipientSearch] = useState('')
  const [recipientResults, setRecipientResults] = useState<any[]>([])
  const [isSearchingRecipient, setIsSearchingRecipient] = useState(false)
  const [showRecipientDropdown, setShowRecipientDropdown] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-load threads when component mounts if identity is available
  useEffect(() => {
    if (identity) loadThreads(identity.user_id, identity.user_type)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!recipientSearch.trim() || recipientSearch.length < 2) {
      setRecipientResults([])
      return
    }
    const timer = setTimeout(async () => {
      setIsSearchingRecipient(true)
      try {
        const endpoint = newParticType === 'member' ? '/members/search' : '/recruiters/search'
        const res = await apiPost<any>(endpoint, { keyword: recipientSearch, page_size: 5 })
        const items = (res.data || []).map((item: any) => ({
          id: item.member_id || item.recruiter_id,
          name: `${item.first_name} ${item.last_name}`,
          headline: item.headline || item.company_name,
          photo_url: item.profile_photo_url
        }))
        setRecipientResults(items)
        setShowRecipientDropdown(true)
      } catch (err) {
        console.error('Recipient search failed', err)
      } finally {
        setIsSearchingRecipient(false)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [recipientSearch, newParticType])

  useEffect(() => {
    if (identity && initialTargetId && initialTargetType) {
      setNewL(true)
      apiPost<{ success: boolean; message: string; data: ThreadData }>(
        '/threads/open',
        { participant_ids: [
            { user_id: identity.user_id, user_type: identity.user_type },
            { user_id: initialTargetId, user_type: initialTargetType },
          ] },
      ).then(r => {
        if (r.success) {
          loadThreads(identity.user_id, identity.user_type)
          selectThread(r.data.thread_id)
        }
      }).catch(e => {
        console.error('Failed to open initial thread', e)
      }).finally(() => {
        setNewL(false)
        onTargetConsumed?.()
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTargetId, initialTargetType])

  async function loadThreads(id: number, type: UserType) {
    setThreadsL(true)
    setThreadsErr(null)
    try {
      const r = await apiPost<{ success: boolean; message: string; data: ThreadData[] }>(
        '/threads/byUser', { user_id: id, user_type: type, page: 1, page_size: 30 },
      )
      if (!r.success) throw new Error(r.message)
      const sorted = (r.data ?? []).sort((a: any, b: any) => {
        const tA = new Date(a.updated_at || a.created_at).getTime()
        const tB = new Date(b.updated_at || b.created_at).getTime()
        return tB - tA
      })
      setThreads(sorted)
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
      setMessages(r.data ?? [])
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
              >
                <div className="thread-avatar">
                  {t.other_participant?.photo_url ? (
                    <img src={t.other_participant.photo_url} alt="" />
                  ) : (
                    <div className="avatar-placeholder">{t.other_participant?.name?.[0] || '?'}</div>
                  )}
                </div>
                <div className="thread-info">
                  <div className="thread-top">
                    <span className="thread-subject">
                      {t.other_participant?.name || t.subject || `Thread #${t.thread_id}`}
                    </span>
                    <span className="thread-date">{fmtDate(t.created_at)}</span>
                  </div>
                  {t.last_message && (
                    <span className="thread-preview">
                      {t.last_message.message_text.slice(0, 45)}{t.last_message.message_text.length > 45 ? '…' : ''}
                    </span>
                  )}
                </div>
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
                <label className="form-label" style={{ position: 'relative' }}>
                  Recipient Name
                  <input 
                    value={recipientSearch} 
                    onChange={e => {
                      setRecipientSearch(e.target.value)
                      if (!e.target.value) {
                        setNewPart('')
                        setShowRecipientDropdown(false)
                      }
                    }} 
                    onFocus={() => recipientResults.length > 0 && setShowRecipientDropdown(true)}
                    placeholder="Search by name..." 
                  />
                  {showRecipientDropdown && recipientResults.length > 0 && (
                    <div className="recipient-dropdown">
                      {recipientResults.map(r => (
                        <div key={r.id} className="recipient-item" onClick={() => {
                          setNewPart(String(r.id))
                          setRecipientSearch(r.name)
                          setShowRecipientDropdown(false)
                        }}>
                          <div className="recipient-avatar">
                            {r.photo_url ? <img src={r.photo_url} alt="" /> : (r.name?.[0] || '?')}
                          </div>
                          <div className="recipient-info">
                            <div className="recipient-name">{r.name}</div>
                            <div className="recipient-sub">{r.headline}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {isSearchingRecipient && <div className="recipient-loading">Searching...</div>}
                </label>
                <div style={{ display: 'none' }}>
                  <input type="number" value={newParticipant} readOnly />
                </div>
                <label className="form-label">
                  Recipient type
                  <select 
                    value={newParticType} 
                    onChange={e => {
                      setNewPType(e.target.value as UserType)
                      setRecipientSearch('')
                      setRecipientResults([])
                    }} 
                    className="identity-select"
                  >
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
                        <div className="msg-bubble-header">
                          <span className="msg-sender">
                            {isMe ? 'You' : (selectedThread?.other_participant?.name || `${m.sender_type} #${m.sender_id}`)}
                          </span>
                          <span className="msg-time">{fmtTime(m.timestamp)}</span>
                        </div>
                        <span className="msg-text">{m.message_text}</span>
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
