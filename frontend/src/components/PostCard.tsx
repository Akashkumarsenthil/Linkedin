import React, { useRef, useState } from 'react'
import { apiPost, apiGet } from '../api'
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
  active_reaction?: string | null
  reaction_counts?: Record<string, number>
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
  isSaved?: boolean
  onToggleSave?: (id: number) => void
  onDeleted?: (post_id: number) => void
  onNavigateProfile?: (id: number) => void
}

const REACTION_TYPES = [
  { type: 'like',       label: 'Like',       emoji: '👍', color: '#0a66c2' },
  { type: 'celebrate',  label: 'Celebrate',  emoji: '👏', color: '#70b5f9' },
  { type: 'support',    label: 'Support',    emoji: '❤️', color: '#f5987e' },
  { type: 'love',       label: 'Love',       emoji: '💖', color: '#e21d48' },
  { type: 'insightful', label: 'Insightful', emoji: '💡', color: '#f9d14b' },
  { type: 'funny',      label: 'Funny',      emoji: '😄', color: '#70b5f9' },
]

interface ReactionUser {
  like_id: number
  user_id: number
  user_type: string
  reaction_type: string
  user: {
    name: string
    headline?: string
    photo_url?: string
  }
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

export function PostCard({ 
  post, currentUserId, currentUserType, currentUserPhoto, currentUserName, 
  isSaved, onToggleSave, onDeleted, onNavigateProfile 
}: PostCardProps) {
  const [likes, setLikes] = useState<number>(post.likes_count || 0)
  const [liked, setLiked] = useState<boolean>(!!post.liked_by_me)
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>(post.reaction_counts || {})
  const [activeReactionType, setActiveReactionType] = useState<string | null>(post.active_reaction || (post.liked_by_me ? 'like' : null))
  const [busy, setBusy] = useState(false)

  const [showComments, setShowComments] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentText, setCommentText] = useState('')
  const [commentBusy, setCommentBusy] = useState(false)
  const [totalComments, setTotalComments] = useState(post.comments_count || 0)
  const [commentPage, setCommentPage] = useState(1)
  const [hasMoreComments, setHasMoreComments] = useState(false)
  const commentInputRef = useRef<HTMLInputElement>(null)

  // Reaction Modal
  const [showReactionModal, setShowReactionModal] = useState(false)
  const [reactionUsers, setReactionUsers] = useState<ReactionUser[]>([])
  const [reactionModalType, setReactionModalType] = useState<string>('all')
  const [reactionModalBusy, setReactionModalBusy] = useState(false)

  const isMine =
    currentUserId != null &&
    currentUserType === post.author_type &&
    currentUserId === post.author_id

  const initials =
    (post.author?.name || '')
      .split(' ')
      .filter(Boolean)
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'

  const handleReaction = async (type: string = 'like') => {
    if (busy) return
    setBusy(true)

    // Optimistic update
    const isSame = activeReactionType === type
    const nextLiked = isSame ? false : true
    const nextType = isSame ? null : type
    
    setLiked(nextLiked)
    setActiveReactionType(nextType)
    setLikes((prev: number) => prev + (isSame ? -1 : (liked ? 0 : 1)))
    setReactionCounts((prev: Record<string, number>) => {
      const copy = { ...prev }
      if (activeReactionType) copy[activeReactionType] = Math.max(0, (copy[activeReactionType] || 0) - 1)
      if (nextType) copy[nextType] = (copy[nextType] || 0) + 1
      return copy
    })

    try {
      const res = await apiPost<any>('/posts/like', { post_id: post.post_id, reaction_type: type })
      if (res.data) {
        setLikes(res.data.likes_count)
        setLiked(res.data.liked_by_me)
        setActiveReactionType(res.data.active_reaction)
        setReactionCounts(res.data.reaction_counts || {})
      }
    } catch {
      // rollback
    } finally {
      setBusy(false)
    }
  }

  const loadMoreComments = async (reset = false) => {
    if (commentBusy) return
    setCommentBusy(true)
    const page = reset ? 1 : commentPage + 1
    try {
      const res = await apiPost<any>('/posts/comments/list', { 
        post_id: post.post_id, 
        page, 
        page_size: 5 
      })
      if (res.data) {
        setComments(prev => reset ? res.data.comments : [...prev, ...res.data.comments])
        setHasMoreComments(res.data.has_more)
        setCommentPage(page)
        setTotalComments(res.data.total)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setCommentBusy(false)
    }
  }

  const toggleComments = async () => {
    const next = !showComments
    setShowComments(next)
    if (next && comments.length === 0) {
      loadMoreComments(true)
    }
    if (next) setTimeout(() => commentInputRef.current?.focus(), 100)
  }

  const fetchReactionUsers = async (type: string = 'all') => {
    setReactionModalBusy(true)
    setReactionModalType(type)
    try {
      const data = await apiGet<any>(`/posts/${post.post_id}/reactions?type=${type}`)
      if (data.success) {
        setReactionUsers(data.data.reactions)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setReactionModalBusy(false)
    }
  }

  const submitComment = async () => {
    if (!commentText.trim() || commentBusy) return
    setCommentBusy(true)
    const text = commentText.trim()
    setCommentText('')
    try {
      const res = await apiPost<any>('/posts/comments/add', {
        post_id: post.post_id,
        content: text,
      })
      if (res.data) {
        setComments((prev) => [res.data, ...prev])
        setTotalComments(prev => prev + 1)
      }
    } catch (err) {
      console.error(err)
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
    } catch {
      alert('Failed to repost')
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
    } catch (err) {
      console.error(err)
    } finally {
      setBusy(false)
    }
  }

  const [connections, setConnections] = useState<any[]>([])
  const [showShareModal, setShowShareModal] = useState(false)
  const [shareBusy, setShareBusy] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const openShareModal = async () => {
    setShowShareModal(true)
    if (connections.length === 0) {
      setShareBusy(true)
      try {
        const res = await apiPost<any>('/connections/list', { 
          user_id: currentUserId,
          status: 'accepted' 
        })
        const list = (res.data || [])
          .map((item: any) => item.connected_member)
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

  const getActiveReaction = () => {
    if (!activeReactionType) return null
    return REACTION_TYPES.find(r => r.type === activeReactionType) || REACTION_TYPES[0]
  }

  const activeReaction = getActiveReaction()

  return (
    <article className="post-card">
      <header className="post-card-header">
        <div 
          className="post-card-avatar"
          onClick={() => onNavigateProfile?.(post.author_id)}
          style={{ cursor: onNavigateProfile ? 'pointer' : 'default' }}
        >
          {post.author.photo_url ? (
            <img src={post.author.photo_url} alt={post.author.name} />
          ) : (
            <div className="avatar-placeholder">{initials}</div>
          )}
        </div>
        <div className="post-card-meta">
          <div className="post-card-name-row">
            <strong 
              className="post-card-name" 
              onClick={() => onNavigateProfile?.(post.author_id)}
              style={{ cursor: onNavigateProfile ? 'pointer' : 'default' }}
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
            >
              <Icon name="more-horizontal" size={18} />
            </button>
            {showMenu && (
              <div className="post-card-menu-dropdown">
                {!isMine && (
                  <button 
                    className="menu-item"
                    style={{ color: isSaved ? 'var(--li-link)' : 'inherit' }}
                    onClick={() => { onToggleSave?.(post.post_id); setShowMenu(false); }}
                  >
                    <Icon name="bookmark" size={16} /> 
                    <span>{isSaved ? 'Unsave post' : 'Save post'}</span>
                  </button>
                )}
                <button 
                  className="menu-item"
                  onClick={() => { 
                    const url = `${window.location.origin}/posts/${post.post_id}`
                    navigator.clipboard.writeText(url)
                    alert('Link copied to clipboard!')
                    setShowMenu(false)
                  }}
                >
                  <Icon name="link" size={16} /> <span>Copy link to post</span>
                </button>
                {isMine && (
                  <button
                    className="menu-item delete"
                    onClick={() => { setShowMenu(false); handleDelete(); }}
                    disabled={busy}
                  >
                    <Icon name="trash" size={16} /> <span>Delete post</span>
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

      {(likes > 0 || totalComments > 0) && (
        <div className="post-stats-row">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div className="post-reaction-circles" onClick={() => { setShowReactionModal(true); fetchReactionUsers('all'); }} style={{ cursor: 'pointer' }}>
              {(Object.keys(reactionCounts).filter(k => reactionCounts[k] > 0).length > 0) ? (
                Object.keys(reactionCounts).filter(k => reactionCounts[k] > 0).slice(0, 3).map((type, idx) => {
                  const r = REACTION_TYPES.find(rt => rt.type === type)
                  return (
                    <div key={type} className="post-reaction-circle" style={{ background: r?.color || '#0a66c2', zIndex: 10 - idx }}>
                      {r?.emoji || '👍'}
                    </div>
                  )
                })
              ) : (
                likes > 0 && (
                  <div className="post-reaction-circle" style={{ background: '#0a66c2', zIndex: 10 }}>
                    👍
                  </div>
                )
              )}
            </div>
            <span 
              style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--li-text-sec)', cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); setShowReactionModal(true); fetchReactionUsers('all'); }}
              className="hover-underline"
            >
              {liked ? (
                <>
                  <span 
                    onClick={(e) => { e.stopPropagation(); onNavigateProfile?.(currentUserId || 0); }} 
                    style={{ fontWeight: 700, color: 'var(--li-link)', cursor: 'pointer' }}
                    className="hover-underline"
                  >
                    You
                  </span>
                  {likes > 1 ? (
                    <span>
                      {` and ${likes - 1} ${likes - 1 === 1 ? 'other' : 'others'}`}
                    </span>
                  ) : ''}
                </>
              ) : (
                likes > 0 ? (
                  <span className="reaction-summary-text">
                    {`${likes} ${likes === 1 ? 'like' : 'likes'}`}
                  </span>
                ) : ''
              )}
            </span>
          </div>
          {totalComments > 0 && (
            <button
              type="button"
              className="stat-link"
              onClick={toggleComments}
            >
              {totalComments} comment{totalComments !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      )}

      <div className="post-actions-bar">
        <div 
          className="reaction-button-wrapper"
          onMouseEnter={(e) => {
            const menu = e.currentTarget.querySelector('.reaction-menu') as HTMLElement;
            if (menu) {
              menu.style.display = 'flex';
              // Clear any pending close timeout
              const wrapper = e.currentTarget as any;
              if (wrapper._closeTimer) clearTimeout(wrapper._closeTimer);
            }
          }}
          onMouseLeave={(e) => {
            const menu = e.currentTarget.querySelector('.reaction-menu') as HTMLElement;
            const wrapper = e.currentTarget as any;
            if (menu) {
              // Add a 1000ms delay before closing
              wrapper._closeTimer = setTimeout(() => {
                menu.style.display = 'none';
              }, 1000);
            }
          }}
        >
          <div className="reaction-menu" style={{ display: 'none' }}>
            {REACTION_TYPES.map(r => (
              <div key={r.label} className="reaction-option" onClick={() => handleReaction(r.type)} title={r.label}>
                <span className="reaction-emoji">{r.emoji}</span>
                <span className="reaction-label">{r.label}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            className={`post-action-btn ${liked ? 'active' : ''}`}
            onClick={() => handleReaction('like')}
            disabled={busy}
            style={{ color: activeReaction ? activeReaction.color : 'inherit' }}
          >
            {activeReaction ? (
              <span className="active-emoji">{activeReaction.emoji}</span>
            ) : (
              <Icon name="thumb" size={20} />
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

      {/* ── Reaction Modal ── */}
      {showReactionModal && (
        <div className="modal-overlay" onClick={() => setShowReactionModal(false)}>
          <div className="modal-content reaction-modal" onClick={e => e.stopPropagation()}>
            <header className="modal-header">
              <div className="reaction-tabs">
                <button className={reactionModalType === 'all' ? 'active' : ''} onClick={() => fetchReactionUsers('all')}>All</button>
                {REACTION_TYPES.map(r => (
                  reactionCounts[r.type] > 0 && (
                    <button key={r.type} className={reactionModalType === r.type ? 'active' : ''} onClick={() => fetchReactionUsers(r.type)}>
                      {r.emoji} {reactionCounts[r.type]}
                    </button>
                  )
                ))}
              </div>
              <button className="modal-close" onClick={() => setShowReactionModal(false)}>×</button>
            </header>
            <div className="modal-body">
              {reactionModalBusy ? (
                <div className="loading-spinner">Loading...</div>
              ) : (
                <div className="reaction-user-list">
                  {reactionUsers.map(u => (
                    <div key={u.like_id} className="reaction-user-item" onClick={() => { setShowReactionModal(false); onNavigateProfile?.(u.user_id); }}>
                      <div className="user-avatar-stack">
                        <div className="user-avatar-circle">
                          {u.user.photo_url ? (
                            <img src={u.user.photo_url} alt="" className="user-avatar" />
                          ) : (
                            <div className="avatar-placeholder">{u.user.name[0].toUpperCase()}</div>
                          )}
                        </div>
                        <span className="reaction-badge">{REACTION_TYPES.find(rt => rt.type === u.reaction_type)?.emoji}</span>
                      </div>
                      <div className="user-info">
                        <p className="user-name">{u.user.name}</p>
                        <p className="user-headline">{u.user.headline}</p>
                      </div>
                    </div>
                  ))}
                  {reactionUsers.length === 0 && <p className="empty-state">No reactions yet.</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Share Modal ── */}
      {showShareModal && (
        <div className="modal-overlay" onClick={() => setShowShareModal(false)}>
          <div className="modal-content share-modal" onClick={e => e.stopPropagation()}>
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
                        {c.photo_url ? <img src={c.photo_url} alt="" /> : <span>{c.name?.[0]}</span>}
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
                              content: post.content?.slice(0, 100),
                              image_url: post.image_url,
                            })
                          })
                          alert(`Sent to ${c.name}!`)
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

      {/* ── Comments Section ── */}
      {showComments && (
        <div className="post-comments-section">
          <div className="comment-composer">
            <div className="composer-avatar">
              {currentUserPhoto ? (
                <img src={currentUserPhoto} alt="You" />
              ) : (
                <div className="avatar-placeholder">{(currentUserName?.[0] || 'U').toUpperCase()}</div>
              )}
            </div>
            <div className="composer-input-wrapper">
              <input
                ref={commentInputRef}
                className="comment-input"
                placeholder="Add a comment…"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitComment()}
              />
              {commentText.trim() && (
                <button type="button" className="comment-submit-btn" onClick={submitComment} disabled={commentBusy}>
                  Post
                </button>
              )}
            </div>
          </div>

          <ul className="comment-list">
            {comments.map((c) => (
              <li key={c.comment_id} className="comment-item">
                <div className="comment-avatar" onClick={() => onNavigateProfile?.(c.author_id)}>
                  {c.author_photo_url ? (
                    <img src={c.author_photo_url} alt={c.author_name} />
                  ) : (
                    <div className="avatar-placeholder">{c.author_name[0]}</div>
                  )}
                </div>
                <div className="comment-bubble">
                  <div className="comment-header">
                    <button type="button" className="comment-author-name" onClick={() => onNavigateProfile?.(c.author_id)}>
                      {c.author_name}
                    </button>
                    <span className="comment-time">{formatRelativeTime(c.created_at)}</span>
                  </div>
                  <p className="comment-content" style={{ marginTop: '4px', whiteSpace: 'pre-wrap' }}>{c.content}</p>
                </div>
              </li>
            ))}
          </ul>
          
          {hasMoreComments && (
            <button className="load-more-comments" onClick={() => loadMoreComments()} disabled={commentBusy}>
              {commentBusy ? 'Loading...' : 'Load more comments'}
            </button>
          )}
        </div>
      )}
    </article>
  )
}
