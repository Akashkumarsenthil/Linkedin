import { useRef, useState } from 'react'
import { apiPost } from '../api'
import { Icon } from './Icon'

interface Comment {
  comment_id: number | string
  author_name: string
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
  onDeleted?: (post_id: number) => void
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

export function PostCard({ post, currentUserId, currentUserType, onDeleted }: PostCardProps) {
  const [likes, setLikes] = useState<number>(post.likes_count || 0)
  const [liked, setLiked] = useState<boolean>(!!post.liked_by_me)
  const [busy, setBusy] = useState(false)

  // Comments state
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentText, setCommentText] = useState('')
  const [commentBusy, setCommentBusy] = useState(false)
  const [commentCount, setCommentCount] = useState(post.comments_count || 0)
  const commentInputRef = useRef<HTMLInputElement>(null)

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
    setLikes((n: number) => n + (liked ? -1 : 1))
    setLiked((v: boolean) => !v)
    try {
      await apiPost('/posts/like', { post_id: post.post_id })
    } catch {
      setLikes((n: number) => n + (liked ? 1 : -1))
      setLiked((v: boolean) => !v)
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
        { comment_id: Date.now(), author_name: 'You', content: text },
      ])
      setCommentCount((n) => n + 1)
    } finally {
      setCommentBusy(false)
    }
  }

  return (
    <article className="post-card">
      <header className="post-card-header">
        <div className="post-card-avatar">
          {post.author.photo_url ? (
            <img src={post.author.photo_url} alt={post.author.name} />
          ) : (
            <span>{initials}</span>
          )}
        </div>
        <div className="post-card-meta">
          <div className="post-card-name-row">
            <strong className="post-card-name">{post.author.name}</strong>
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
        {isMine && (
          <button
            type="button"
            className="post-card-delete"
            onClick={handleDelete}
            disabled={busy}
            title="Delete post"
          >
            <Icon name="trash" size={16} />
          </button>
        )}
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
        <div className="post-card-stats">
          {likes > 0 && (
            <span className="post-stat">
              <span className="post-stat-dot post-stat-dot-like">
                <Icon name="thumb" size={10} />
              </span>
              {likes}
            </span>
          )}
          {commentCount > 0 && (
            <button
              type="button"
              className="post-stat post-stat-link"
              onClick={toggleComments}
            >
              {commentCount} comment{commentCount !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      )}

      <div className="post-card-actions">
        <button
          type="button"
          className={`post-action ${liked ? 'post-action-active' : ''}`}
          onClick={handleLike}
          disabled={busy}
        >
          <Icon name="thumb" size={18} />
          <span>{liked ? 'Liked' : 'Like'}</span>
        </button>
        <button
          type="button"
          className={`post-action ${showComments ? 'post-action-active' : ''}`}
          onClick={toggleComments}
        >
          <Icon name="comment" size={18} />
          <span>Comment</span>
        </button>
        <button type="button" className="post-action" disabled title="Coming soon">
          <Icon name="share" size={18} />
          <span>Share</span>
        </button>
      </div>

      {/* ── Inline Comments Section ── */}
      {showComments && (
        <div className="post-comments-section">
          {/* Input row */}
          <div className="post-comment-input-row">
            <div className="post-comment-avatar">
              <span>{(currentUserId ? `U${currentUserId}` : 'U').slice(0, 2)}</span>
            </div>
            <input
              ref={commentInputRef}
              type="text"
              className="post-comment-input"
              placeholder="Add a comment…"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitComment()}
            />
            {commentText.trim() && (
              <button
                type="button"
                className="post-comment-submit"
                onClick={submitComment}
                disabled={commentBusy}
              >
                {commentBusy ? '…' : '↵'}
              </button>
            )}
          </div>

          {/* Comments list */}
          {comments.length > 0 && (
            <ul className="post-comment-list">
              {comments.map((c) => (
                <li key={c.comment_id} className="post-comment-item">
                  <div className="post-comment-avatar">
                    <span>{c.author_name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="post-comment-bubble">
                    <span className="post-comment-author">{c.author_name}</span>
                    <span className="post-comment-text">{c.content}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  )
}
