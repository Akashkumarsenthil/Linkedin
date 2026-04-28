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
}

function iconForType(type: string): string {
  switch (type) {
    case 'connection_request': return 'connections'
    case 'post_like':           return 'thumb'
    case 'connection_post':     return 'article'
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

export function NotificationsPanel({
  notifications,
  unreadCount,
  onRefresh,
  onOpenConnections,
}: NotificationsPanelProps) {
  return (
    <section className="panel notif-panel">
      <header className="notif-header">
        <div>
          <h2 className="panel-title">Notifications</h2>
          <p className="panel-subtitle">
            {unreadCount > 0
              ? `You have ${unreadCount} action${unreadCount === 1 ? '' : 's'} pending.`
              : 'You’re all caught up.'}
          </p>
        </div>
        <button type="button" className="ghost-btn" onClick={onRefresh}>
          Refresh
        </button>
      </header>

      {notifications.length === 0 ? (
        <div className="notif-empty">
          <Icon name="bell" size={28} className="notif-empty-icon" />
          <p><strong>No notifications yet.</strong></p>
          <p className="muted">
            When someone sends you a connection request, likes your post,
            or shares something new, you’ll see it here.
          </p>
        </div>
      ) : (
        <ul className="notif-list">
          {notifications.map((n) => {
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
              >
                <div className="notif-avatar">
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
                  <p className="notif-title">{n.title}</p>
                  {n.subtitle && <p className="notif-subtitle">{n.subtitle}</p>}
                  <p className="notif-time">{formatRelative(n.created_at)}</p>
                </div>
                {isAction && (
                  <button
                    type="button"
                    className="primary notif-action"
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
    </section>
  )
}
