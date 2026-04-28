import { useRef, useState } from 'react'
import { apiPost } from '../api'
import { Icon } from './Icon'

interface Comment {
  comment_id: number | string
  author_id: number
  author_name: string
  author_photo_url?: string | null
  content: string
  created_at?: string | null
}

export interface FeedPost {
  post_id: number
  author_id: number
  author_type: 'member' | 'recruiter' | string
  content: string
  image_url?: string | null
  likes_count: number
  comments_count: number
  created_at?: string | null
  liked_by_me?: boolean
  author: {
    name: string
    headline?: string | null
    photo_url?: string | null
    location?: string | null
  }
}

interface PostCardProps {
  post: FeedPost
  currentUserId?: number
  currentUserType?: string
  currentUserPhoto?: string | null
  currentUserName?: string
  onDeleted?: (post_id: number) => void
  onNavigateProfile?: (id: number) => void
}

function formatRelativeTime(iso?: string | null): string {
  if (!iso) return ''
  const normalized = iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z'
  const d = new Date(normalized)
  if (isNaN(d.getTime())) return ''
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d`
  return d.toLocaleDateString()
}

export function PostCard({ post, currentUserId, currentUserType, currentUserPhoto, currentUserName, onDeleted, onNavigateProfile }: PostCardProps) {
  const [likes, setLikes] = useState<number>(post.likes_count || 0)
  const [liked, setLiked] = useState<boolean>(!!post.liked_by_me)
  const [activeReaction, setActiveReaction] = useState<{ label: string, emoji: string, color: string } | null>(
    post.liked_by_me ? { label: 'Like', emoji: '👍', color: '#0a66c2' } : null
  )
  const [busy, setBusy] = useState(false)

  const [showComments, setShowComments] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentText, setCommentText] = useState('')
  const [commentBusy, setCommentBusy] = useState(false)
  const [commentCount, setCommentCount] = useState(post.comments_count || 0)
  const commentInputRef = useRef<HTMLInputElement>(null)

  // Share state
  const [showShareModal, setShowShareModal] = useState(false)
  const [connections, setConnections] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [shareBusy, setShareBusy] = useState(false)

  const isMine =
    currentUserId != null &&
    currentUserType === post.author_type &&
    currentUserId === post.author_id

  const initials =
    (post.author?.name || '')
      .split(' ')
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'

  const handleLike = async () => {
    if (busy) return
    setBusy(true)
    const nextLiked = !liked
    setLikes((n: number) => n + (liked ? -1 : 1))
    setLiked(nextLiked)
    
    if (!nextLiked) {
      setActiveReaction(null)
    } else if (!activeReaction) {
      setActiveReaction({ label: 'Like', emoji: '👍', color: '#0a66c2' })
    }

    try {
      await apiPost('/posts/like', { post_id: post.post_id })
    } catch {
      setLikes((n: number) => n + (liked ? 1 : -1))
      setLiked(!nextLiked)
      if (!liked) setActiveReaction(null)
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!isMine || busy) return
    if (!confirm('Delete this post?')) return
    setBusy(true)
    try {
      await apiPost('/posts/delete', { post_id: post.post_id })
      onDeleted?.(post.post_id)
    } finally {
      setBusy(false)
    }
  }

  const toggleComments = async () => {
    const next = !showComments
    setShowComments(next)
    if (next && comments.length === 0) {
      try {
        const res = await apiPost<{ data: Comment[] }>('/posts/comments/list', { post_id: post.post_id })
        setComments(res.data || [])
      } catch {
        // stay quiet — comments will just be empty
      }
    }
    if (next) setTimeout(() => commentInputRef.current?.focus(), 100)
  }

  const submitComment = async () => {
    if (!commentText.trim() || commentBusy) return
    setCommentBusy(true)
    const text = commentText.trim()
    setCommentText('')
    try {
      const res = await apiPost<{ data: Comment }>('/posts/comments/add', {
        post_id: post.post_id,
        content: text,
      })
      setComments((prev) => [...prev, res.data])
      setCommentCount((n) => n + 1)
    } catch {
      // Optimistic fallback: show locally even if API fails
      setComments((prev) => [
        ...prev,
        { comment_id: Date.now(), author_name: currentUserName || 'You', author_photo_url: currentUserPhoto, content: text },
      ])
      setCommentCount((n) => n + 1)
    } finally {
      setCommentBusy(false)
    }
  }

  const handleRepost = async () => {
    if (busy) return
    setBusy(true)
    try {
      await apiPost('/posts/create', {
        content: `Reposted from ${post.author.name}:\n\n${post.content}`,
        image_url: post.image_url
      })
      alert('Post reposted successfully!')
      window.location.reload() // Reload to see the new post
    } catch {
      alert('Failed to repost')
    } finally {
      setBusy(false)
    }
  }

  const openShareModal = async () => {
    setShowShareModal(true)
    if (connections.length === 0) {
      setShareBusy(true)
      try {
        const res = await apiPost<{ data: any[] }>('/connections/list', { 
          user_id: currentUserId,
          status: 'accepted' 
        })
        const list = (res.data || [])
          .map(item => item.connected_member)
          .filter(Boolean)
        setConnections(list)
      } catch (err) {
        console.error('Failed to load connections', err)
      } finally {
        setShareBusy(false)
      }
    }
  }

  const filteredConnections = connections.filter(c => {
    const name = (c.name || '').toLowerCase()
    return name.includes(searchQuery.toLowerCase())
  })

  const handleReaction = async (reaction: { label: string, emoji: string, color: string }) => {
    if (busy) return
    setActiveReaction(reaction)
    if (!liked) {
      await handleLike()
    }
  }

  return (
    <article className="post-card">
      <header className="post-card-header">
        <div 
          className="post-card-avatar"
          onClick={() => post.author_type === 'member' && onNavigateProfile?.(post.author_id)}
          style={{ cursor: post.author_type === 'member' && onNavigateProfile ? 'pointer' : 'default' }}
        >
          {post.author.photo_url ? (
            <img src={post.author.photo_url} alt={post.author.name} />
          ) : (
            <span>{initials}</span>
          )}
        </div>
        <div className="post-card-meta">
          <div className="post-card-name-row">
            <strong 
              className="post-card-name" 
              onClick={() => post.author_type === 'member' && onNavigateProfile?.(post.author_id)}
              style={{ cursor: post.author_type === 'member' && onNavigateProfile ? 'pointer' : 'default' }}
            >
              {post.author.name}
            </strong>
            {post.author_type === 'recruiter' && (
              <span className="post-card-badge">Recruiter</span>
            )}
          </div>
          {post.author.headline && (
            <p className="post-card-headline">{post.author.headline}</p>
          )}
          <p className="post-card-time">
            {formatRelativeTime(post.created_at)}
            {post.author.location ? ` · ${post.author.location}` : ''}
          </p>
        </div>
        <div className="post-card-header-right">
          <div className="post-card-menu-container" style={{ position: 'relative' }}>
            <button 
              type="button" 
              className="post-card-menu-btn" 
              onClick={() => setShowMenu(!showMenu)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', fontSize: '18px', color: '#666' }}
            >
              ...
            </button>
            {showMenu && (
              <div 
                className="post-card-menu-dropdown" 
                style={{ 
                  position: 'absolute', right: 0, top: '100%', background: 'white', 
                  border: '1px solid #ddd', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', 
                  width: '200px', zIndex: 100, padding: '8px 0'
                }}
              >
                {!isMine && (
                  <button 
                    style={{ display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#333' }}
                    onClick={() => { alert('Post saved!'); setShowMenu(false); }}
                  >
                    <Icon name="bookmark" size={16} /> <span style={{ marginLeft: '8px' }}>Save post</span>
                  </button>
                )}
                <button 
                  style={{ display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#333' }}
                  onClick={() => { 
                    const url = `${window.location.origin}/posts/${post.post_id}`
                    navigator.clipboard.writeText(url)
                    alert('Link copied to clipboard!')
                    setShowMenu(false)
                  }}
                >
                  <Icon name="link" size={16} /> <span style={{ marginLeft: '8px' }}>Copy link to post</span>
                </button>
                {!isMine && (
                  <button 
                    style={{ display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#333' }}
                    onClick={() => { alert(`Unfollowed ${post.author.name}`); setShowMenu(false); }}
                  >
                    <Icon name="close" size={16} /> <span style={{ marginLeft: '8px' }}>Unfollow {post.author.name.split(' ')[0]}</span>
                  </button>
                )}
                {isMine && (
                  <button
                    type="button"
                    style={{ display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#d11124' }}
                    onClick={(e) => { setShowMenu(false); handleDelete(e); }}
                    disabled={busy}
                  >
                    <Icon name="trash" size={16} /> <span style={{ marginLeft: '8px' }}>Delete post</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {post.content && post.content.trim() && (
        <div className="post-card-body">{post.content}</div>
      )}

      {post.image_url && (
        <div className="post-card-image">
          <img src={post.image_url} alt="" />
        </div>
      )}

      {(likes > 0 || commentCount > 0) && (
        <div className="post-stats-row">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div className="post-reaction-circles">
              <div className="post-reaction-circle" style={{ background: '#0a66c2', zIndex: 3 }}>👍</div>
              <div className="post-reaction-circle" style={{ background: '#70b5f9', zIndex: 2 }}>👏</div>
              <div className="post-reaction-circle" style={{ background: '#f5987e', zIndex: 1 }}>❤️</div>
            </div>
            <span style={{ marginLeft: '8px', cursor: 'pointer' }} onClick={() => onNavigateProfile?.(post.author_id)}>
              {liked ? (likes === 1 ? 'You' : `You and ${likes - 1} others`) : (likes > 0 ? likes : '')}
            </span>
          </div>
          {commentCount > 0 && (
            <button
              type="button"
              className="stat-link"
              onClick={toggleComments}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 'inherit' }}
            >
              {commentCount} comment{commentCount !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      )}

      <div className="post-actions-bar">
        <div 
          style={{ position: 'relative', flex: 1 }}
          onMouseEnter={(e) => {
            const menu = e.currentTarget.querySelector('.reaction-menu') as HTMLElement;
            if (menu) menu.style.display = 'flex';
          }}
          onMouseLeave={(e) => {
            const menu = e.currentTarget.querySelector('.reaction-menu') as HTMLElement;
            if (menu) menu.style.display = 'none';
          }}
        >
          <div className="reaction-menu" style={{ display: 'none' }}>
            {[
              { label: 'Like', emoji: '👍', color: '#0a66c2' },
              { label: 'Celebrate', emoji: '👏', color: '#44712e' },
              { label: 'Support', emoji: '🫂', color: '#df704d' },
              { label: 'Love', emoji: '❤️', color: '#d11124' },
              { label: 'Insightful', emoji: '💡', color: '#f5c862' },
              { label: 'Funny', emoji: '😂', color: '#4b9bba' },
            ].map(r => (
              <div key={r.label} className="reaction-option" onClick={() => handleReaction(r)} title={r.label}>
                {r.emoji}
              </div>
            ))}
          </div>
          <button
            type="button"
            className={`post-action-btn ${liked ? 'active' : ''}`}
            onClick={handleLike}
            disabled={busy}
            style={{ color: activeReaction ? activeReaction.color : 'inherit' }}
          >
            {activeReaction ? (
              <span style={{ fontSize: '20px' }}>{activeReaction.emoji}</span>
            ) : (
              <Icon name="like" size={20} />
            )}
            <span>{activeReaction ? activeReaction.label : 'Like'}</span>
          </button>
        </div>
        <button type="button" className="post-action-btn" onClick={toggleComments}>
          <Icon name="comment" size={20} />
          <span>Comment</span>
        </button>
        <button type="button" className="post-action-btn" onClick={handleRepost}>
          <Icon name="repost" size={20} />
          <span>Repost</span>
        </button>
        <button type="button" className="post-action-btn" onClick={openShareModal}>
          <Icon name="send" size={20} />
          <span>Send</span>
        </button>
      </div>

      {/* ── Share Modal ── */}
      {showShareModal && (
        <div className="modal-overlay" onClick={() => setShowShareModal(false)}>
          <div className="modal-content share-modal" onClick={e => e.stopPropagation()}>
            <header className="modal-header">
              <h3>Send {post.author.name.split(' ')[0]}'s Post</h3>
              <button className="modal-close" onClick={() => setShowShareModal(false)}>×</button>
            </header>
            <div className="modal-body">
              <div className="share-search-box">
                <Icon name="search" size={16} />
                <input 
                  type="text" 
                  placeholder="Search connections" 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="share-connections-list">
                {shareBusy ? (
                  <p className="share-loading">Loading connections...</p>
                ) : filteredConnections.length === 0 ? (
                  <p className="share-empty">No connections found.</p>
                ) : (
                  filteredConnections.map(c => (
                    <div key={c.member_id} className="share-conn-item">
                      <div className="share-conn-avatar">
                        {c.photo_url ? (
                          <img src={c.photo_url} alt="" />
                        ) : (
                          <span>{c.name?.[0]}</span>
                        )}
                      </div>
                      <div className="share-conn-info">
                        <p className="share-conn-name">{c.name}</p>
                        <p className="share-conn-headline">{c.headline}</p>
                      </div>
                      <button 
                        className="share-send-btn"
                        onClick={() => {
                          apiPost('/messages/direct', {
                            sender_id: currentUserId,
                            recipient_id: c.member_id,
                            recipient_type: c.user_type,
                              message_text: JSON.stringify({
                                type: 'shared_post',
                                post_id: post.post_id,
                                author_name: post.author?.name,
                                author_headline: post.author?.headline,
                                author_photo_url: post.author?.photo_url,
                                content: post.content?.slice(0, 200),
                                image_url: post.image_url,
                                created_at: post.created_at,
                              })
                          })
                          alert(`Post sent to ${c.name.split(' ')[0]}!`)
                          setShowShareModal(false)
                        }}
                      >
                        Send
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Inline Comments Section ── */}
      {showComments && (
        <div className="post-comments-section">
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <div className="post-comment-avatar" style={{ width: '40px', height: '40px' }}>
              {currentUserPhoto ? (
                <img src={currentUserPhoto} alt="You" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#ddd', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {(currentUserName?.[0] || 'U').toUpperCase()}
                </div>
              )}
            </div>
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                ref={commentInputRef}
                className="post-comment-input"
                placeholder="Add a comment…"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitComment()}
                style={{
                  width: '100%',
                  borderRadius: '24px',
                  border: '1px solid #ccc',
                  padding: '10px 16px',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
              {commentText.trim() && (
                <button
                  type="button"
                  onClick={submitComment}
                  disabled={commentBusy}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'var(--li-link)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '16px',
                    padding: '4px 12px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Post
                </button>
              )}
            </div>
          </div>

          {comments.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '16px', cursor: 'pointer' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--li-text-sec)' }}>Most relevant</span>
              <Icon name="chevron-down" size={14} color="var(--li-text-sec)" />
            </div>
          )}

          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {comments.map((c) => (
              <li key={c.comment_id} className="post-comment-item">
                <div className="post-comment-avatar" style={{ width: '40px', height: '40px' }} onClick={() => onNavigateProfile?.(c.author_id)}>
                  {c.author_photo_url ? (
                    <img src={c.author_photo_url} alt={c.author_name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#f3f2ef', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 600 }}>
                      {c.author_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="post-comment-bubble">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <button 
                        type="button"
                        onClick={() => onNavigateProfile?.(c.author_id)}
                        className="post-comment-author"
                        style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                      >
                        {c.author_name}
                      </button>
                      <span style={{ fontSize: '12px', color: 'var(--li-text-sec)' }}>{formatRelativeTime(c.created_at)}</span>
                    </div>
                    <Icon name="more-horizontal" size={16} color="var(--li-text-sec)" />
                  </div>
                  <p className="post-comment-text" style={{ marginTop: '4px' }}>{c.content}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  )
}
