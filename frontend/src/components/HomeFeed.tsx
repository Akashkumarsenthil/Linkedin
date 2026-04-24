import { useCallback, useEffect, useState } from 'react'
import { apiPost } from '../api'
import { Icon } from './Icon'
import { PostComposer } from './PostComposer'
import { PostCard, type FeedPost } from './PostCard'

interface HomeFeedProps {
  me: {
    user_id: number
    user_type: 'member' | 'recruiter'
    email: string
    profile: Record<string, unknown>
  } | null
  onNavigateProfile: () => void
}

interface NewsItem {
  headline: string
  age: string
  readers: string
}

const NEWS_ITEMS: NewsItem[] = [
  { headline: 'Mendoza goes first in NFL draft',       age: '57m ago', readers: '65,438 readers' },
  { headline: 'OpenAI launches GPT-5.5 as next step',  age: '1h ago',  readers: '17,694 readers' },
  { headline: 'Meta is laying off 8K staffers',        age: '1h ago',  readers: '11,954 readers' },
  { headline: 'US reclassifies some marijuana',        age: '1h ago',  readers: '6,212 readers' },
  { headline: 'Intel shares spike amid signs of turnaround', age: '1h ago', readers: '4,038 readers' },
]

const TODAY_PUZZLES = [
  { name: 'Patches #37',     sub: 'Piece it together',      color: '#fbbc05' },
  { name: 'Zip #402',        sub: '12 connections played',  color: '#0a66c2' },
  { name: 'Mini Sudoku #255',sub: 'The classic game, made mini', color: '#6b4226' },
  { name: 'Tango #563',      sub: 'Harmonize the grid',     color: '#e85d49' },
]

export function HomeFeed({ me, onNavigateProfile }: HomeFeedProps) {
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadFeed = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiPost<{ data: FeedPost[] }>('/posts/feed', {
        page: 1,
        page_size: 20,
      })
      setPosts(res.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadFeed() }, [loadFeed])

  if (!me) {
    // Guests should not see this; App.tsx handles fallback.
    return null
  }

  const profile = me.profile as Record<string, unknown>
  const firstName = String(profile.first_name || '')
  const lastName  = String(profile.last_name  || '')
  const name = `${firstName} ${lastName}`.trim() || me.email
  const headline = String(profile.headline || profile.company_name || '') || ' '
  const city = String(profile.location_city || '')
  const state = String(profile.location_state || '')
  const country = String(profile.location_country || '')
  const location = [city, state, country].filter(Boolean).join(', ')
  const photo = (profile.profile_photo_url as string | undefined) || null

  const initials =
    `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase() ||
    me.email.substring(0, 2).toUpperCase()

  return (
    <div className="home-feed-layout">
      {/* ── LEFT RAIL — profile card ──────────────────────────────── */}
      <aside className="feed-left-rail">
        <div className="feed-profile-card">
          <div className="feed-profile-cover" />
          <button
            type="button"
            className="feed-profile-avatar-btn"
            onClick={onNavigateProfile}
            title="View your profile"
          >
            {photo ? (
              <img src={photo} alt={name} className="feed-profile-avatar-img" />
            ) : (
              <div className="feed-profile-avatar-fallback">{initials}</div>
            )}
          </button>
          <div className="feed-profile-info">
            <button
              type="button"
              className="feed-profile-name-btn"
              onClick={onNavigateProfile}
            >
              {name}
            </button>
            {headline.trim() && (
              <p className="feed-profile-headline">{headline}</p>
            )}
            {location && <p className="feed-profile-location">{location}</p>}
          </div>
          <div className="feed-profile-stats">
            <button type="button" className="feed-stat-row" onClick={onNavigateProfile}>
              <span className="feed-stat-label">Profile viewers</span>
              <span className="feed-stat-value">
                {Number(profile.profile_views || 0).toLocaleString()}
              </span>
            </button>
            <button type="button" className="feed-stat-row" onClick={onNavigateProfile}>
              <span className="feed-stat-label">Connections</span>
              <span className="feed-stat-value">
                {Number(profile.connections_count || 0).toLocaleString()}
              </span>
            </button>
          </div>
        </div>

        <nav className="feed-left-links" aria-label="Shortcuts">
          <a className="feed-left-link" href="#saved">
            <Icon name="check" size={16} /> Saved items
          </a>
          <a className="feed-left-link" href="#groups">
            <Icon name="connections" size={16} /> Groups
          </a>
          <a className="feed-left-link" href="#news">
            <Icon name="article" size={16} /> Newsletters
          </a>
          <a className="feed-left-link" href="#events">
            <Icon name="analytics" size={16} /> Events
          </a>
        </nav>
      </aside>

      {/* ── CENTER — composer + feed ─────────────────────────────── */}
      <section className="feed-center">
        <PostComposer
          authorName={name}
          authorHeadline={headline}
          authorPhoto={photo}
          onPosted={loadFeed}
        />

        <div className="feed-sort-row">
          <span className="feed-sort-label">Sort by:</span>
          <button type="button" className="feed-sort-btn">Top <span>▾</span></button>
        </div>

        {loading && posts.length === 0 ? (
          <div className="feed-empty">Loading posts…</div>
        ) : error ? (
          <div className="feed-empty feed-empty-error">{error}</div>
        ) : posts.length === 0 ? (
          <div className="feed-empty">
            <strong>No posts yet.</strong>
            <p>Be the first to share an update with the network.</p>
          </div>
        ) : (
          <div className="feed-posts">
            {posts.map((p) => (
              <PostCard
                key={p.post_id}
                post={p}
                currentUserId={me.user_id}
                currentUserType={me.user_type}
                onDeleted={(id) => setPosts((prev) => prev.filter((x) => x.post_id !== id))}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── RIGHT RAIL — news + puzzles ──────────────────────────── */}
      <aside className="feed-right-rail">
        <div className="feed-news-card">
          <div className="feed-news-header">
            <h3 className="feed-news-title">LinkedIn News</h3>
          </div>
          <p className="feed-news-sub">Top stories</p>
          <ul className="feed-news-list">
            {NEWS_ITEMS.map((item, idx) => (
              <li key={idx} className="feed-news-item">
                <span className="feed-news-bullet" />
                <div>
                  <p className="feed-news-headline">{item.headline}</p>
                  <p className="feed-news-meta">{item.age} · {item.readers}</p>
                </div>
              </li>
            ))}
          </ul>
          <button type="button" className="feed-news-more">Show more news ▾</button>

          <div className="feed-puzzles-section">
            <p className="feed-news-sub">Today's puzzles</p>
            <ul className="feed-puzzles-list">
              {TODAY_PUZZLES.map((p, idx) => (
                <li key={idx} className="feed-puzzle-item">
                  <span
                    className="feed-puzzle-swatch"
                    style={{ background: p.color }}
                  />
                  <div>
                    <p className="feed-puzzle-name">{p.name}</p>
                    <p className="feed-puzzle-sub">{p.sub}</p>
                  </div>
                  <span className="feed-puzzle-arrow">›</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="feed-promo-card">
          <span className="feed-promo-tag">Promoted</span>
          <p className="feed-promo-headline">
            {firstName || 'Explore'}, explore relevant opportunities on the platform
          </p>
          <p className="feed-promo-sub">
            Get the latest jobs and industry news tailored for you.
          </p>
          <button type="button" className="secondary-btn feed-promo-btn">
            Follow
          </button>
        </div>
      </aside>
    </div>
  )
}
