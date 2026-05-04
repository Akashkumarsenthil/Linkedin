import { useState } from 'react'
import { Icon } from './Icon'

interface NotificationItem {
  id: string
  type: string
  title: string
  subtitle?: string | null
  actor_id?: number
  actor_type?: string
  actor_photo_url?: string | null
  post_id?: number
  created_at?: string | null
  unread?: boolean
}

interface NotificationsPanelProps {
  notifications: NotificationItem[]
  unreadCount: number
  onRefresh: () => void
  onOpenConnections: () => void
  onNavigateProfile?: (id: number) => void
  onNavigatePost?: (id: number) => void
  onNavigateMessage?: (actorId: number, actorType?: string | null) => void
}

function iconForType(type: string): string {
  switch (type) {
    case 'connection_request': return 'connections'
    case 'post_like':           return 'thumb'
    case 'connection_post':     return 'article'
    case 'profile_view':        return 'eye'
    case 'new_message':         return 'messaging'
    default:                    return 'bell'
  }
}

function formatRelative(iso?: string | null): string {
  if (!iso) return ''
  const normalized = iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z'
  const d = new Date(normalized)
  if (isNaN(d.getTime())) return ''
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d`
  return d.toLocaleDateString()
}

function formatSubtitle(subtitle?: string | null): string | null {
  if (!subtitle) return null;
  if (subtitle.startsWith('{"type":"shared_post"')) {
    try {
      const parsed = JSON.parse(subtitle);
      return `Shared you a post by ${parsed.author_name || 'user'}`;
    } catch {
      return subtitle;
    }
  }
  return subtitle;
}

export function NotificationsPanel({
  notifications,
  unreadCount,
  onRefresh,
  onOpenConnections,
  onNavigateProfile,
  onNavigatePost,
  onNavigateMessage,
}: NotificationsPanelProps) {
  const params = new URLSearchParams(window.location.search)
  const initialFilter = params.get('section') === 'profile-views' ? 'views' : 'all'
  const [filter, setFilter] = useState<'all' | 'views' | 'messages'>(initialFilter as any)

  const filteredNotifications = filter === 'views' 
    ? notifications.filter(n => n.type === 'profile_view')
    : filter === 'messages'
    ? notifications.filter(n => n.type === 'new_message')
    : notifications

  return (
    <section className="panel premium-panel" style={{ marginTop: 16 }}>
      <header className="premium-header" style={{ padding: '24px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 className="premium-title">Notifications</h2>
          <p className="premium-subtitle">
            {unreadCount > 0
              ? `You have ${unreadCount} action${unreadCount === 1 ? '' : 's'} pending.`
              : 'You’re all caught up.'}
          </p>
        </div>
        <button type="button" className="ghost-btn" style={{ marginTop: 4 }} onClick={onRefresh}>
          Refresh
        </button>
      </header>

      <div style={{ padding: '0 24px 24px' }}>
        <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
          <button 
            type="button" 
            className={`pill-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Icon name="bell" size={16} />
            All notifications
          </button>
          <button 
            type="button" 
            className={`pill-btn ${filter === 'views' ? 'active' : ''}`}
            onClick={() => setFilter('views')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Icon name="eye" size={16} />
            Profile views
          </button>
          <button 
            type="button" 
            className={`pill-btn ${filter === 'messages' ? 'active' : ''}`}
            onClick={() => setFilter('messages')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Icon name="messaging" size={16} />
            Messages
          </button>
        </div>

        {filteredNotifications.length === 0 ? (
          <div className="notif-empty">
            <Icon name="bell" size={28} className="notif-empty-icon" />
            <p><strong>No {filter === 'views' ? 'profile views' : filter === 'messages' ? 'messages' : 'notifications'} yet.</strong></p>
            <p className="muted">
              {filter === 'views' ? "When someone views your profile, it will appear here." : filter === 'messages' ? "When you receive a new message, it will appear here." : "When someone sends you a connection request, likes your post, or shares something new, you’ll see it here."}
            </p>
          </div>
        ) : (
          <ul className="notif-list">
            {filteredNotifications.map((n) => {
              const isAction = n.type === 'connection_request'
              const initials =
                (n.title || 'U')
                  .split(' ')
                  .map((p) => p[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()
              return (
                <li
                  key={n.id}
                  className={`notif-item${n.unread ? ' notif-item-unread' : ''}`}
                  style={{ cursor: (n.post_id || n.type === 'new_message') ? 'pointer' : 'default' }}
                  onClick={() => {
                    if (n.type === 'new_message' && n.actor_id && onNavigateMessage) {
                      onNavigateMessage(n.actor_id, n.actor_type)
                    } else if (n.post_id && onNavigatePost) {
                      onNavigatePost(n.post_id)
                    }
                  }}
                >
                  <div 
                    className="notif-avatar"
                    style={{ cursor: n.actor_id ? 'pointer' : 'default' }}
                    onClick={(e) => {
                      if (n.actor_id && onNavigateProfile) {
                        e.stopPropagation()
                        onNavigateProfile(n.actor_id)
                      }
                    }}
                  >
                    {n.actor_photo_url ? (
                      <img src={n.actor_photo_url} alt="" />
                    ) : (
                      <span className="notif-avatar-fallback">{initials}</span>
                    )}
                    <span className={`notif-type notif-type-${n.type}`}>
                      <Icon name={iconForType(n.type)} size={12} />
                    </span>
                  </div>
                  <div className="notif-body">
                    <p 
                      className="notif-title" 
                      style={{ cursor: n.actor_id ? 'pointer' : 'default' }}
                      onClick={(e) => {
                        if (n.actor_id && onNavigateProfile && !n.post_id) {
                          e.stopPropagation()
                          onNavigateProfile(n.actor_id)
                        }
                      }}
                    >{n.title}</p>
                    {n.subtitle && n.type !== 'profile_view' && <p className="notif-subtitle">{formatSubtitle(n.subtitle)}</p>}
                    <p className="notif-time">{formatRelative(n.created_at)}</p>
                  </div>
                  {isAction && (
                    <button
                      type="button"
                      className="primary"
                      onClick={onOpenConnections}
                    >
                      Review
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
