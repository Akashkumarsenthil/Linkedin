import { useState } from 'react'
import { apiPost } from '../api'
import { Icon } from './Icon'

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
    // Optimistic update
    setLikes((n) => n + (liked ? -1 : 1))
    setLiked((v) => !v)
    try {
      await apiPost('/posts/like', { post_id: post.post_id })
    } catch {
      // Roll back on failure
      setLikes((n) => n + (liked ? 1 : -1))
      setLiked((v) => !v)
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

      {(likes > 0 || post.comments_count > 0) && (
        <div className="post-card-stats">
          {likes > 0 && (
            <span className="post-stat">
              <span className="post-stat-dot post-stat-dot-like">
                <Icon name="thumb" size={10} />
              </span>
              {likes}
            </span>
          )}
          {post.comments_count > 0 && (
            <span className="post-stat">{post.comments_count} comments</span>
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
        <button type="button" className="post-action" disabled title="Coming soon">
          <Icon name="comment" size={18} />
          <span>Comment</span>
        </button>
        <button type="button" className="post-action" disabled title="Coming soon">
          <Icon name="send" size={18} />
          <span>Share</span>
        </button>
      </div>
    </article>
  )
}
