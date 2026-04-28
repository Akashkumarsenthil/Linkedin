import { useEffect, useState } from 'react'
import { apiGet } from '../api'
import { PostCard, type FeedPost } from './PostCard'
import { Icon } from './Icon'

interface PostPageProps {
  me: {
    user_id: number
    user_type: 'member' | 'recruiter' | 'admin'
    email: string
    profile: Record<string, unknown>
  } | null
  postId: number
  onNavigateProfile?: (id?: number) => void
  onBack?: () => void
}

const NEWS_ITEMS = [
  { headline: 'Mendoza goes first in NFL draft',              age: '57m ago', readers: '65,438 readers' },
  { headline: 'OpenAI launches GPT-5.5 as next step',        age: '1h ago',  readers: '17,694 readers' },
  { headline: 'Meta is laying off 8K staffers',              age: '1h ago',  readers: '11,954 readers' },
  { headline: 'US reclassifies some marijuana',              age: '1h ago',  readers: '6,212 readers' },
  { headline: 'Intel shares spike amid signs of turnaround', age: '1h ago',  readers: '4,038 readers' },
]

export function PostPage({ me, postId, onNavigateProfile, onBack }: PostPageProps) {
  const [post, setPost] = useState<FeedPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadPost() {
      try {
        setLoading(true)
        setError(null)
        // Ensure postId is a number
        const id = typeof postId === 'string' ? parseInt(postId) : postId
        if (isNaN(id)) {
          setError('Invalid post ID')
          return
        }
        const res = await apiGet<{ success: boolean; data: FeedPost; message: string }>(`/posts/${id}`)
        if (res.success && res.data) {
          setPost(res.data)
        } else {
          setError(res.message || 'Post not found.')
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load post')
      } finally {
        setLoading(false)
      }
    }
    loadPost()
  }, [postId])

  if (!me) return null

  const profile   = me.profile as Record<string, unknown>
  const firstName = String(profile.first_name || '')
  const lastName  = String(profile.last_name  || '')
  const name      = `${firstName} ${lastName}`.trim() || me.email
  const headline  = String(profile.headline || profile.company_name || '') || ' '
  const photo     = (profile.profile_photo_url as string | undefined) || null
  const initials  = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase() || me.email.substring(0, 2).toUpperCase()

  return (
    <div className="home-feed-layout">
      <aside className="feed-left-rail">
        <div className="feed-profile-card">
          <div className="feed-profile-cover ln-blue-sky-gradient" />
          <button type="button" className="feed-profile-avatar-btn" onClick={() => onNavigateProfile?.(me.user_id)}>
            {photo ? <img src={photo} alt={name} className="feed-profile-avatar-img" /> : <div className="feed-profile-avatar-fallback">{initials}</div>}
          </button>
          <div className="feed-profile-info">
            <button type="button" className="feed-profile-name-btn" onClick={() => onNavigateProfile?.(me.user_id)}>{name}</button>
            {headline.trim() && <p className="feed-profile-headline">{headline}</p>}
          </div>
          {me.user_type === 'member' && (
            <div className="feed-profile-stats">
              <div className="feed-stat-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="eye" size={16} style={{ color: 'var(--text-muted)' }} />
                  <span className="feed-stat-label">Profile viewers</span>
                </div>
                <span className="feed-stat-value">{Number(profile.profile_views || 0).toLocaleString()}</span>
              </div>
              <div className="feed-stat-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="connections" size={16} style={{ color: 'var(--text-muted)' }} />
                  <span className="feed-stat-label">Connections</span>
                </div>
                <span className="feed-stat-value">{Number(profile.connections_count || 0).toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>
      </aside>

      <section className="feed-center">
        <div className="li-card" style={{ padding: '8px 16px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button className="icon-btn" onClick={onBack} aria-label="Back">
            <Icon name="arrow-left" size={20} />
          </button>
          <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Post</h2>
        </div>

        {loading && <div className="li-card" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-sec)' }}>Loading post...</div>}
        
        {error && !loading && (
          <div className="li-card" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-error)' }}>
            <p>{error}</p>
            <button className="secondary-btn" onClick={onBack} style={{ marginTop: '12px' }}>Go back</button>
          </div>
        )}

        {post && !loading && (
          <PostCard 
            post={post} 
            currentUserId={me.user_id}
            currentUserType={me.user_type}
            currentUserPhoto={photo}
            currentUserName={name}
            onNavigateProfile={onNavigateProfile}
            onDeleted={onBack}
          />
        )}
      </section>

      <aside className="feed-right-rail">
        <div className="feed-news-card li-card">
          <div className="feed-news-header">
            <h3 className="feed-news-title">LinkedIn News</h3>
          </div>
          <p className="feed-news-sub">Top stories</p>
          <ul className="feed-news-list">
            {NEWS_ITEMS.slice(0, 5).map((item, idx) => (
              <li key={idx} className="feed-news-item">
                <span className="feed-news-bullet" />
                <div>
                  <p className="feed-news-headline">{item.headline}</p>
                  <p className="feed-news-meta">{item.age} · {item.readers}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  )
}
