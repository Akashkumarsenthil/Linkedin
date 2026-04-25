import { useEffect, useState } from 'react'

interface Activity {
  id: number
  initial: string
  title: string
  time: string
  accent: 'blue' | 'green' | 'purple' | 'orange'
}

const SEED: Omit<Activity, 'id' | 'time'>[] = [
<<<<<<< Updated upstream
  { initial: 'M', title: 'Senior ML Engineer posted by Acme Corp', accent: 'blue' },
  { initial: 'A', title: 'AI shortlist approved for Backend Engineer role', accent: 'green' },
  { initial: 'J', title: 'Jane Smith accepted your connection', accent: 'purple' },
  { initial: 'R', title: 'New message from recruiter at Globex', accent: 'blue' },
  { initial: 'P', title: '1,247 profile views this week', accent: 'orange' },
  { initial: 'H', title: 'Hiring Assistant completed 3 workflows', accent: 'green' },
  { initial: 'K', title: 'Kafka processed 12.4k events in the last hour', accent: 'blue' },
  { initial: 'R', title: 'Resume parser extracted 48 skills', accent: 'purple' },
=======
  { icon: '💼', title: 'Senior ML Engineer posted by Acme Corp', accent: 'blue' },
  { icon: '🎯', title: 'AI shortlist approved for Backend Engineer role', accent: 'green' },
  { icon: '🤝', title: 'Jane Smith accepted your connection', accent: 'purple' },
  { icon: '✉', title: 'New message from recruiter at Globex', accent: 'blue' },
  { icon: '📈', title: '1,247 profile views this week', accent: 'orange' },
  { icon: '🚀', title: 'Hiring Assistant completed 3 workflows', accent: 'green' },
  { icon: '🧠', title: 'Resume parser extracted 48 skills', accent: 'purple' },
>>>>>>> Stashed changes
]

function timeAgo(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return `${h}h ago`
}

export function ActivityFeed() {
  const [items, setItems] = useState<Activity[]>(() =>
    SEED.slice(0, 5).map((s, i) => ({ ...s, id: i, time: timeAgo((i + 1) * 47_000) })),
  )

  useEffect(() => {
    const t = setInterval(() => {
      setItems((prev) => {
        const seed = SEED[Math.floor(Math.random() * SEED.length)]
        const next: Activity = { ...seed, id: Date.now(), time: 'just now' }
        return [next, ...prev.slice(0, 4)]
      })
    }, 6500)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="activity-card">
      <div className="activity-header">
        <div className="activity-title-wrap">
          <span className="live-pulse" />
          <h3 className="activity-title">Network Activity</h3>
        </div>
<<<<<<< Updated upstream
        <span className="activity-sub">Live</span>
=======
>>>>>>> Stashed changes
      </div>
      <ul className="activity-list">
        {items.map((it) => (
          <li key={it.id} className={`activity-item accent-${it.accent}`}>
            <span className="activity-icon">{it.initial}</span>
            <div className="activity-body">
              <span className="activity-line">{it.title}</span>
              <span className="activity-time">{it.time}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
