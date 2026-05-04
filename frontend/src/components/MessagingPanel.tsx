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

function parseUtcDate(d: string) {
  if (!d) return new Date();
  let clean = d.trim().replace(' ', 'T');
  if (!clean.endsWith('Z')) clean += 'Z';
  return new Date(clean);
}

function fmtDate(d: string) {
  const dt = parseUtcDate(d)
  const now = new Date()
  if (dt.toDateString() === now.toDateString()) return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return dt.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function fmtTime(d: string) {
  return parseUtcDate(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function tryParseRichMessage(text: string) {
  if (text.startsWith('{"type":')) {
    try { return JSON.parse(text) } catch { return null }
  }
  return null
}

function SharedPostLoader({ sharedPost, onNavigatePost, isMe }: { sharedPost: any, onNavigatePost?: (postId: number) => void, isMe?: boolean }) {
  const [postData, setPostData] = useState<any>(null)
  useEffect(() => {
    const id = sharedPost.postId || sharedPost.post_id;
    if (id) {
      apiGet<{ data: any }>(`/posts/${id}`).then(r => setPostData(r.data)).catch(() => { })
    }
  }, [sharedPost.postId, sharedPost.post_id])

  if (!postData) return <div className="hint" style={{ padding: '12px', border: '1px solid #eee', borderRadius: '8px' }}>Loading shared post...</div>

  const authorName = postData.author?.name || postData.author_name || 'user'
  const shareText = isMe ? `You shared a post by ${authorName}` : `Shared you a post of ${authorName}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: '13px', color: 'var(--li-text-sec)', marginBottom: '6px' }}>
        {shareText}
      </div>
      <div
        className="shared-post-card"
        onClick={() => onNavigatePost?.(postData.post_id)}
        style={{ border: '1px solid var(--li-border)', borderRadius: '8px', overflow: 'hidden', background: '#fff', cursor: 'pointer', maxWidth: '300px' }}
      >
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #eee', fontSize: '12px', fontWeight: 600, color: 'var(--li-text-primary)' }}>
          {authorName}
        </div>
        <p style={{ padding: '8px 12px', margin: 0, fontSize: '13px', color: 'var(--li-text-primary)' }}>{postData.content?.slice(0, 80)}...</p>
        {postData.image_url && (
          <img className="shared-post-image" src={postData.image_url} alt="Post" style={{ maxWidth: '100%', display: 'block' }} />
        )}
      </div>
    </div>
  )
}

export function MessagingPanel({
  onNavigateProfile, onNavigatePost, targetUserId, targetUserType, onClearTarget
}: {
  onNavigateProfile?: (id: number) => void
  onNavigatePost?: (postId: number) => void
  targetUserId?: number | null
  targetUserType?: string | null
  onClearTarget?: () => void
}) {
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

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [stagedFile, setStagedFile] = useState<{ url: string; filename: string; mime_type: string } | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [lightboxName, setLightboxName] = useState<string>('')
  const [emojiPickerMsgId, setEmojiPickerMsgId] = useState<number | null>(null)
  const [msgReactions, setMsgReactions] = useState<Record<number, string>>({})

  const MSG_EMOJIS = ['👍','❤️','😂','😮','😢','🙏','🎉','🔥']

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

  // Track whether we've already handled a given targetUserId+type to prevent loops
  const handledTargetRef = useRef<string | null>(null)

  // Auto-load threads when component mounts
  useEffect(() => {
    if (identity?.user_id && identity?.user_type) {
      loadThreads(identity.user_id, identity.user_type)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Run once on mount

  // Handle targetUserId for direct messaging from profile or notification
  useEffect(() => {
    const targetKey = targetUserId ? `${targetUserId}:${targetUserType || 'member'}` : null
    if (!targetUserId || !identity || handledTargetRef.current === targetKey) return
    handledTargetRef.current = targetKey

    async function handleTarget() {
      // First reload threads to get latest state
      const freshThreads = await apiPost<{ success: boolean; data: ThreadData[] }>(
        '/threads/byUser', { user_id: identity!.user_id, user_type: identity!.user_type, page: 1, page_size: 30 }
      )
      const threadList = freshThreads.data ?? []
      setThreads(threadList)

      const resolvedType = targetUserType || 'member'

      // Match by both user_id AND user_type for precision
      let existing = threadList.find(t =>
        t.other_participant?.user_id === targetUserId &&
        t.other_participant?.user_type === resolvedType
      )
      // Fallback: match by user_id only if no exact type match
      if (!existing) {
        existing = threadList.find(t => t.other_participant?.user_id === targetUserId)
      }

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
            { user_id: targetUserId, user_type: resolvedType }
          ]
        })
        if (res.success) {
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
    if (!identity || !selectedId) return
    if (!msgText.trim() && !stagedFile) return
    setSendL(true)
    setSendErr(null)
    try {
      let messageText = msgText.trim()
      if (stagedFile) {
        // If there's also text, prepend it as a caption field in the attachment JSON
        messageText = JSON.stringify({
          type: 'attachment',
          url: stagedFile.url,
          filename: stagedFile.filename,
          mime_type: stagedFile.mime_type,
          caption: msgText.trim() || undefined
        })
      }
      const r = await apiPost<{ success: boolean; message: string; data: MsgData }>(
        '/messages/send',
        { thread_id: selectedId, sender_id: identity.user_id, sender_type: identity.user_type, message_text: messageText },
      )
      if (!r.success) throw new Error(r.message)
      setMessages(prev => [...prev, r.data])
      setMsgText('')
      setStagedFile(null)
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : 'Failed to send message')
    } finally {
      setSendL(false)
    }
  }

  function handleFileChange(e: { target: HTMLInputElement }) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { setSendErr('File must be under 10 MB'); return }
    setSendErr(null)
    const reader = new FileReader()
    reader.onload = () => {
      setStagedFile({ url: reader.result as string, filename: file.name, mime_type: file.type || 'application/octet-stream' })
    }
    reader.readAsDataURL(file)
  }

  function toggleReaction(msgId: number, emoji: string) {
    setMsgReactions(prev => {
      const cur = prev[msgId]
      // If same emoji clicked again, remove it; otherwise set to new emoji
      return { ...prev, [msgId]: cur === emoji ? '' : emoji }
    })
    setEmojiPickerMsgId(null)
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
                          const shared = tryParseRichMessage(t.last_message.message_text);
                          if (shared?.type === 'shared_post') {
                            const isMe = t.last_message.sender_id === identity?.user_id && t.last_message.sender_type === identity?.user_type;
                            return isMe ? "You shared a post" : `${t.other_participant?.name || 'Someone'} shared a post`;
                          }
                          if (shared?.type === 'attachment') {
                            const isMe = t.last_message.sender_id === identity?.user_id && t.last_message.sender_type === identity?.user_type;
                            return isMe ? "You shared an attachment" : `${t.other_participant?.name || 'Someone'} shared an attachment`;
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

                <div className="msg-body" style={{ flex: 1, overflowY: 'auto', padding: '16px' }}
                  onClick={() => { if (emojiPickerMsgId !== null) setEmojiPickerMsgId(null) }}
                >
                  {messages.length === 0 && !msgsLoading && (
                    <p className="hint" style={{ textAlign: 'center', paddingTop: 24 }}>
                      No messages yet. Say hello!
                    </p>
                  )}
                  {messages.map(m => {
                    const isMe = m.sender_id === identity.user_id && m.sender_type === identity.user_type
                    const richMsg = tryParseRichMessage(m.message_text)
                    const reactions = msgReactions[m.message_id]

                    const reactionBar = (
                      <div style={{ position: 'relative', display: 'inline-block', marginTop: 4 }}>
                        <button
                          onClick={e => { e.stopPropagation(); setEmojiPickerMsgId(emojiPickerMsgId === m.message_id ? null : m.message_id) }}
                          style={{
                            background: reactions ? 'rgba(0,0,0,0.08)' : 'none',
                            border: '1px solid #ddd', borderRadius: 12, padding: '2px 8px',
                            cursor: 'pointer', fontSize: reactions ? 16 : 12, color: '#888',
                            lineHeight: '1.4'
                          }}
                          title={reactions ? 'Change reaction' : 'React'}
                        >{reactions || '☺'}</button>
                        {emojiPickerMsgId === m.message_id && (
                          <div onClick={e => e.stopPropagation()} style={{
                            position: 'absolute', bottom: '110%', [isMe ? 'right' : 'left']: 0,
                            background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '6px 8px',
                            display: 'flex', gap: 4, zIndex: 200, boxShadow: '0 4px 16px rgba(0,0,0,0.15)'
                          }}>
                            {MSG_EMOJIS.map(em => (
                              <button key={em} onClick={() => toggleReaction(m.message_id, em)}
                                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', opacity: reactions === em ? 1 : 0.55, transform: reactions === em ? 'scale(1.3)' : 'scale(1)', transition: 'all 0.1s' }}>
                                {em}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )

                    if (richMsg?.type === 'shared_post') {
                      return (
                        <div key={m.message_id} className={`msg-bubble-row${isMe ? ' me' : ''}`}>
                          <div className={`msg-bubble${isMe ? ' msg-bubble-me' : ''}`} style={{ background: 'transparent', boxShadow: 'none', padding: 0 }}>
                            <SharedPostLoader sharedPost={richMsg} onNavigatePost={onNavigatePost} isMe={isMe} />
                            <span className="msg-time" style={{ textAlign: isMe ? 'right' : 'left' }}>{fmtTime(m.timestamp)}</span>
                            {reactionBar}
                          </div>
                        </div>
                      )
                    }

                    if (richMsg?.type === 'attachment') {
                      const isImage = richMsg.mime_type?.startsWith('image/')
                      return (
                        <div key={m.message_id} className={`msg-bubble-row${isMe ? ' me' : ''}`}>
                          {!isMe && (
                            <div className="msg-avatar" onClick={() => selectedThread?.other_participant && onNavigateProfile?.(selectedThread.other_participant.user_id)} style={{ cursor: 'pointer' }}>
                              {selectedThread?.other_participant?.photo_url
                                ? <img src={selectedThread.other_participant.photo_url} alt="" />
                                : <div className="avatar-placeholder">{selectedThread?.other_participant?.name?.[0] || m.sender_type[0].toUpperCase()}</div>}
                            </div>
                          )}
                          <div className={`msg-bubble${isMe ? ' msg-bubble-me' : ''}`}>
                            {isImage ? (
                              <img
                                src={richMsg.url} alt={richMsg.filename}
                                style={{ maxWidth: '220px', borderRadius: 10, display: 'block', marginBottom: richMsg.caption ? 0 : 4, cursor: 'pointer' }}
                                onClick={() => { setLightboxUrl(richMsg.url); setLightboxName(richMsg.filename) }}
                              />
                            ) : (
                              <div
                                style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(10,102,194,0.08)', padding: '10px 14px', borderRadius: 10, marginBottom: richMsg.caption ? 0 : 4, cursor: 'pointer' }}
                                onClick={() => { setLightboxUrl(richMsg.url); setLightboxName(richMsg.filename) }}
                              >
                                <span style={{ fontSize: 28 }}>📄</span>
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--li-link)' }}>{richMsg.filename}</div>
                                  <div style={{ fontSize: 11, color: '#888' }}>Click to preview &amp; download</div>
                                </div>
                              </div>
                            )}
                            {richMsg.caption && (
                              <span className="msg-text" style={{ display: 'block', margin: '6px 0 4px', fontSize: 14 }}>{richMsg.caption}</span>
                            )}
                            <span className="msg-time">{fmtTime(m.timestamp)}</span>
                            {reactionBar}
                          </div>
                        </div>
                      )
                    }

                    return (
                      <div key={m.message_id} className={`msg-bubble-row${isMe ? ' me' : ''}`}>
                        {!isMe && (
                          <div className="msg-avatar" onClick={() => selectedThread?.other_participant && onNavigateProfile?.(selectedThread.other_participant.user_id)} style={{ cursor: 'pointer' }}>
                            {selectedThread?.other_participant?.photo_url
                              ? <img src={selectedThread.other_participant.photo_url} alt="" />
                              : <div className="avatar-placeholder">{selectedThread?.other_participant?.name?.[0] || m.sender_type[0].toUpperCase()}</div>}
                          </div>
                        )}
                        <div className={`msg-bubble${isMe ? ' msg-bubble-me' : ''}`}>
                          {!isMe && (
                            <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 4 }}>
                              <span className="msg-sender" style={{ cursor: 'pointer' }} onClick={() => selectedThread?.other_participant && onNavigateProfile?.(selectedThread.other_participant.user_id)}>
                                {selectedThread?.other_participant?.name || m.sender_type}
                              </span>
                              {selectedThread?.other_participant?.headline && (
                                <span style={{ fontSize: '11px', color: 'var(--li-text-sec)', marginTop: -2 }}>{selectedThread.other_participant.headline}</span>
                              )}
                            </div>
                          )}
                          <span className="msg-text" style={{ display: 'block', marginBottom: '8px' }}>{m.message_text}</span>
                          <span className="msg-time">{fmtTime(m.timestamp)}</span>
                          {reactionBar}
                        </div>
                      </div>
                    )
                  })}
                  <div ref={bottomRef} />
                </div>

                <div className="msg-compose">
                  {stagedFile && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f0f7ff', border: '1px solid #cce0ff', borderRadius: '10px 10px 0 0', padding: '8px 14px' }}>
                      {stagedFile.mime_type.startsWith('image/') ? (
                        <img src={stagedFile.url} alt={stagedFile.filename} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6 }} />
                      ) : (
                        <span style={{ fontSize: 28 }}>📄</span>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 12, color: '#0a66c2', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stagedFile.filename}</div>
                        <div style={{ fontSize: 11, color: '#888' }}>Will be sent with your message</div>
                      </div>
                      <button onClick={() => setStagedFile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#888', flexShrink: 0 }}>✕</button>
                    </div>
                  )}
                  <div className="msg-compose-row" style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', background: '#fff', border: '1px solid var(--li-border)', borderRadius: stagedFile ? '0 0 12px 12px' : '12px', padding: '12px 16px' }}>
                    <button type="button" className="icon-btn" onClick={() => fileInputRef.current?.click()} disabled={sendLoading} title="Attach file or photo" style={{ marginBottom: '4px', color: stagedFile ? '#0a66c2' : undefined }}>
                      📎
                    </button>
                    <input ref={fileInputRef} type="file" onChange={handleFileChange} style={{ display: 'none' }} accept="image/*,.pdf,.doc,.docx,.txt,.csv" />
                    <textarea
                      className="msg-input" placeholder={stagedFile ? 'Add a caption (optional)...' : 'Write a message...'} rows={3}
                      style={{ flex: 1, border: 'none', background: 'transparent', resize: 'none', padding: '8px 4px', fontSize: '14px', outline: 'none' }}
                      value={msgText}
                      onChange={e => setMsgText((e.target as HTMLTextAreaElement).value)}
                      onKeyDown={e => { if ((e as any).key === 'Enter' && !(e as any).shiftKey) { (e as any).preventDefault(); sendMessage() } }}
                    />
                    <button
                      className="circular-send-btn"
                      style={{ width: '40px', height: '40px', background: 'var(--li-blue-primary)', color: '#fff', border: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s', opacity: sendLoading || (!msgText.trim() && !stagedFile) ? 0.5 : 1, marginBottom: '4px' }}
                      onClick={sendMessage} disabled={sendLoading || (!msgText.trim() && !stagedFile)}
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

      {/* ── Attachment Lightbox ── */}
      {lightboxUrl && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setLightboxUrl(null)}
        >
          <div onClick={e => e.stopPropagation()} style={{ position: 'relative', maxWidth: '90vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            {lightboxUrl.startsWith('data:image') ? (
              <img src={lightboxUrl} alt={lightboxName} style={{ maxWidth: '85vw', maxHeight: '75vh', borderRadius: 12, objectFit: 'contain', boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }} />
            ) : (
              <div style={{ background: '#fff', borderRadius: 12, padding: '40px 60px', textAlign: 'center' }}>
                <div style={{ fontSize: 64, marginBottom: 16 }}>📄</div>
                <p style={{ fontWeight: 600, fontSize: 18, marginBottom: 8 }}>{lightboxName}</p>
                <p style={{ color: '#888', marginBottom: 0 }}>Click Download to save to your computer</p>
              </div>
            )}
            <div style={{ display: 'flex', gap: 12 }}>
              <a
                href={lightboxUrl} download={lightboxName}
                style={{ background: 'var(--li-blue-primary)', color: '#fff', padding: '10px 28px', borderRadius: 24, fontWeight: 700, textDecoration: 'none', fontSize: 14 }}
                onClick={e => e.stopPropagation()}
              >
                ⬇ Download
              </a>
              <button
                onClick={() => setLightboxUrl(null)}
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', padding: '10px 24px', borderRadius: 24, fontWeight: 600, cursor: 'pointer', fontSize: 14 }}
              >✕ Close</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}



