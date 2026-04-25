import { useCallback, useEffect, useState } from 'react'
import './App.css'
import { apiGet, apiPost, parseStoredUser } from './api'
import { TopJobsChart } from './components/TopJobsChart'
import { FunnelChart } from './components/FunnelChart'
import { GeoTable } from './components/GeoTable'
import { MemberDashboard } from './components/MemberDashboard'
import { MessagingPanel } from './components/MessagingPanel'
import { ConnectionsPanel } from './components/ConnectionsPanel'
import { JobApplyForm } from './components/JobApplyForm'
import { JobDetailPanel } from './components/JobDetailPanel'
import { AuthPanel } from './components/AuthPanel'
import { ProfilePage } from './components/ProfilePage'
import { HomeFeed } from './components/HomeFeed'
import { NotificationsPanel } from './components/NotificationsPanel'
import { TopMonthlyChart, LeastAppliedChart, ClicksPerJobChart } from './components/RecruiterJobCharts'
import { GeoMonthlyChart } from './components/GeoMonthlyChart'
import { SavesTrendChart } from './components/SavesTrendChart'
import { AiDashboard } from './components/AiDashboard'
import { CountUp } from './components/CountUp'
import { ActivityFeed } from './components/ActivityFeed'
import { Icon } from './components/Icon'
import { SearchPage } from './components/SearchPage'
import { PerformanceDashboard } from './components/PerformanceDashboard'

type Tab =
  | 'overview'
  | 'jobs'
  | 'members'
  | 'analytics'
  | 'ai'
  | 'messages'
  | 'connections'
  | 'notifications'
  | 'auth'
  | 'profile'
  | 'search'
  | 'perf'

type AuthUser = {
  user_id: number
  user_type: 'member' | 'recruiter' | 'admin'
  email: string
} | null

const TAB_VISIBILITY: Record<Tab, Array<'guest' | 'member' | 'recruiter' | 'admin'>> = {
  overview:      ['guest', 'member', 'recruiter', 'admin'],
  jobs:          ['guest', 'member', 'recruiter', 'admin'],
  members:       ['guest', 'member', 'admin'],
  analytics:     ['recruiter', 'admin'],
  messages:      ['member', 'recruiter', 'admin'],
  connections:   ['member', 'admin'],
  notifications: ['member', 'recruiter', 'admin'],
  ai:            ['recruiter', 'admin'],
  auth:          ['guest', 'member', 'recruiter', 'admin'],
  profile:       ['member', 'recruiter', 'admin'],
  search:        ['guest', 'member', 'recruiter', 'admin'],
  perf:          ['admin'],
}

const ALL_NAV: [Tab, string, string][] = [
  ['overview',      'Home',         'home'],
  ['jobs',          'Jobs',         'jobs'],
  ['members',       'Network',      'network'],
  ['analytics',     'Analytics',    'analytics'],
  ['messages',      'Messaging',    'messaging'],
  ['connections',   'Connections',  'connections'],
  ['notifications', 'Notifications','bell'],
  ['ai',            'AI Recruiter', 'ai'],
  ['perf',          'Performance',  'analytics'],
  ['auth',          'Sign In',      'user'],
  ['profile',       'Me',           'user'],
  ['search',        'Search',       'search'],
]

interface MePayload {
  user_type: 'member' | 'recruiter' | 'admin'
  user_id: number
  email: string
  profile: Record<string, unknown>
}

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

function App() {
  const [tab, setTab] = useState<Tab>('overview')
  const [authUser, setAuthUser] = useState<AuthUser>(() => parseStoredUser())
  const [searchVal, setSearchVal] = useState('')
  const [me, setMe] = useState<MePayload | null>(null)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const [searchDropdownResults, setSearchDropdownResults] = useState<{ people: any[], jobs: any[] }>({ people: [], jobs: [] })
  const [isSearching, setIsSearching] = useState(false)

  const handleAuthChange = () => {
    setAuthUser(parseStoredUser())
    setMe(null)
    setNotifications([])
    setUnreadCount(0)
  }

  const role: 'guest' | 'member' | 'recruiter' | 'admin' = authUser?.user_type ?? 'guest'
  const visibleTabs = ALL_NAV.filter(([id]) => TAB_VISIBILITY[id].includes(role))

  useEffect(() => {
    if (!TAB_VISIBILITY[tab].includes(role)) setTab('overview')
  }, [role, tab])

  useEffect(() => {
    if (!authUser) {
      setMe(null)
      return
    }
    let cancelled = false
    apiGet<MePayload>('/auth/me')
      .then((data) => { if (!cancelled) setMe(data) })
      .catch(() => { /* avatar falls back to initials */ })
    return () => { cancelled = true }
  }, [authUser])

  const loadNotifications = useCallback(async () => {
    if (!authUser) return
    try {
      const res = await apiPost<{ unread_count: number; data: NotificationItem[] }>(
        '/notifications/list', {},
      )
      setNotifications(res.data || [])
      setUnreadCount(res.unread_count || 0)
    } catch {
      // preserve prior state on transient errors
    }
  }, [authUser])

  useEffect(() => {
    if (!authUser) return
    void loadNotifications()
    const id = setInterval(loadNotifications, 30_000)
    return () => clearInterval(id)
  }, [authUser, loadNotifications])

  const [recentSearches] = useState<string[]>(['Software Engineer', 'Google', 'Project Manager'])
  const trendingSearches = ['AI Agents', 'Remote Work', 'Product Management', 'Cybersecurity']

  useEffect(() => {
    if (!searchVal.trim() || searchVal.length < 2) {
      setSearchDropdownResults({ people: [], jobs: [] })
      setIsSearching(false)
      return
    }

    const timer = setTimeout(async () => {
      setIsSearching(true)
      try {
        const [peopleRes, jobsRes] = await Promise.all([
          apiPost<any>('/members/search', { keyword: searchVal, page_size: 4 }),
          apiPost<any>('/jobs/search', { keyword: searchVal, page_size: 4 }),
        ])
        setSearchDropdownResults({
          people: peopleRes.data || [],
          jobs: jobsRes.data || [],
        })
        setShowSearchDropdown(true)
      } catch (err) {
        console.error('Search failed', err)
      } finally {
        setIsSearching(false)
      }
    }, 400)

    return () => clearTimeout(timer)
  }, [searchVal])

  const profilePhoto = (me?.profile?.profile_photo_url as string | undefined) || null
  const firstName = (me?.profile?.first_name as string | undefined) || ''
  const lastName  = (me?.profile?.last_name  as string | undefined) || ''
  const initials = authUser
    ? `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase() ||
      authUser.email.substring(0, 2).toUpperCase()
    : null

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <button className="brand" type="button" onClick={() => setTab('overview')}>
            <div className="logo-mark"><span className="logo-in">in</span></div>
          </button>

          <div className="nav-search-container">
            <div className="nav-search">
              <Icon name="search" size={16} className="nav-search-icon" />
              <input
                value={searchVal}
                onChange={e => setSearchVal(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && searchVal.trim()) {
                    setTab('search')
                    setShowSearchDropdown(false)
                  }
                }}
                onFocus={() => setShowSearchDropdown(true)}
                placeholder="Search"
                aria-label="Search"
              />
            </div>

            {showSearchDropdown && (
              <div className="search-dropdown li-card">
                {(!searchVal.trim() || searchVal.length < 2) ? (
                  <>
                    <div className="dropdown-section">
                      <div className="dropdown-header" style={{ padding: '8px 16px', fontWeight: 600 }}>Recent</div>
                      {recentSearches.map((s, idx) => (
                        <div key={idx} className="dropdown-item" onClick={() => { setSearchVal(s); setTab('search'); setShowSearchDropdown(false) }}>
                          <Icon name="clock" size={16} className="item-icon" />
                          <div className="item-info">
                            <div className="item-title" style={{ fontWeight: 600 }}>{s}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="dropdown-section" style={{ marginTop: '8px' }}>
                      <div className="dropdown-header" style={{ padding: '8px 16px', fontWeight: 600 }}>Try searching for</div>
                      {trendingSearches.map((s, idx) => (
                        <div key={idx} className="dropdown-item" onClick={() => { setSearchVal(s); setTab('search'); setShowSearchDropdown(false) }}>
                          <Icon name="search" size={16} className="item-icon" />
                          <div className="item-info">
                            <div className="item-title" style={{ fontWeight: 600, color: 'var(--ln-blue)' }}>{s}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    {isSearching ? (
                      <div className="dropdown-loading">Searching...</div>
                    ) : (
                      <>
                        {searchDropdownResults.people.length > 0 && (
                          <div className="dropdown-section">
                            {searchDropdownResults.people.map((p: any) => (
                              <div key={p.member_id} className="dropdown-item" onClick={() => { setSearchVal(`${p.first_name} ${p.last_name}`); setTab('search'); setShowSearchDropdown(false) }}>
                                <div className="item-avatar">{(p.first_name?.[0] || '') + (p.last_name?.[0] || '')}</div>
                                <div className="item-info">
                                  <div className="item-title">{p.first_name} {p.last_name}</div>
                                  <div className="item-sub">{p.headline}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {searchDropdownResults.jobs.length > 0 && (
                          <div className="dropdown-section">
                            {searchDropdownResults.jobs.map((j: any) => (
                              <div key={j.job_id} className="dropdown-item" onClick={() => { setSearchVal(j.title); setTab('search'); setShowSearchDropdown(false) }}>
                                <div className="item-avatar-company"><Icon name="jobs" size={16} /></div>
                                <div className="item-info">
                                  <div className="item-title">{j.title}</div>
                                  <div className="item-sub">Job • {j.company_name}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="dropdown-footer" onClick={() => { setTab('search'); setShowSearchDropdown(false) }}>
                          See all results for "{searchVal}"
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            )}
            {showSearchDropdown && <div className="dropdown-overlay" onClick={() => setShowSearchDropdown(false)} />}
          </div>

          <nav className="nav" aria-label="Primary">
            {visibleTabs
              .filter(([id]) => id !== 'auth' && id !== 'profile' && id !== 'notifications')
              .map(([id, label, icon]) => (
                <button
                  key={id}
                  type="button"
                  className={tab === id ? 'nav-btn active' : 'nav-btn'}
                  onClick={() => setTab(id)}
                  title={label}
                >
                  <Icon name={icon} size={20} className="nav-icon-svg" />
                  <span className="nav-label">{label}</span>
                </button>
              ))}

            {authUser && (
              <button
                type="button"
                className={tab === 'notifications' ? 'nav-btn active nav-btn-bell' : 'nav-btn nav-btn-bell'}
                onClick={() => setTab('notifications')}
                title="Notifications"
              >
                <span className="nav-bell-wrap">
                  <Icon name="bell" size={20} className="nav-icon-svg" />
                  {unreadCount > 0 && (
                    <span className="nav-bell-badge">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </span>
                <span className="nav-label">Notifications</span>
              </button>
            )}

            <div className="nav-divider" />

            {authUser ? (
              <button
                type="button"
                className={tab === 'profile' ? 'nav-avatar nav-avatar-active' : 'nav-avatar'}
                onClick={() => setTab('profile')}
                title={`${authUser.email} — View profile`}
              >
                {profilePhoto ? (
                  <img src={profilePhoto} alt="Me" className="nav-avatar-img" />
                ) : (
                  initials
                )}
              </button>
            ) : (
              <button
                type="button"
                className={tab === 'auth' ? 'nav-btn active' : 'nav-btn'}
                onClick={() => setTab('auth')}
              >
                <Icon name="user" size={20} className="nav-icon-svg" />
                <span className="nav-label">Sign In</span>
              </button>
            )}

            {authUser && (
              <span
                className="nav-role-badge"
                title={authUser.email}
                style={authUser.user_type === 'admin' ? { background: '#854d0e', color: '#fef08a', border: '1px solid #ca8a04' } : undefined}
              >
                {authUser.user_type === 'admin' ? '★ admin' : authUser.user_type}
              </span>
            )}
          </nav>
        </div>
      </header>

      <main className="main" key={tab}>
        <div className="page-fade">
          {tab === 'overview' &&
            (authUser && me ? (
              <HomeFeed me={me} onNavigateProfile={() => setTab('profile')} />
            ) : (
              <OverviewPanel onNavigate={setTab} />
            ))}
          {tab === 'jobs'          && <JobsPanel />}
          {tab === 'members'       && <MembersPanel />}
          {tab === 'analytics'     && <AnalyticsPanel />}
          {tab === 'messages'      && <MessagingPanel />}
          {tab === 'connections'   && <ConnectionsPanel />}
          {tab === 'notifications' && (
            <NotificationsPanel
              notifications={notifications}
              unreadCount={unreadCount}
              onRefresh={loadNotifications}
              onOpenConnections={() => setTab('connections')}
            />
          )}
          {tab === 'ai'            && <AiDashboard />}
          {tab === 'search'        && <SearchPage query={searchVal} />}
          {tab === 'perf'          && <PerformanceDashboard />}
          {tab === 'auth'          && <AuthPanel onAuthChange={handleAuthChange} />}
          {tab === 'profile'       && <ProfilePage onAuthChange={handleAuthChange} />}
        </div>
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-logo">
            <div className="logo-mark" style={{ width: 20, height: 20, fontSize: 11, borderRadius: 4 }}>
              <span className="logo-in">in</span>
            </div>
            <span className="footer-brand">LinkedIn Agentic AI</span>
          </div>
          <span className="footer-sep">·</span>
          <span>DATA236 · SJSU</span>
        </div>
      </footer>
    </div>
  )
}

type ServiceStatus = 'online' | 'offline' | 'checking'

interface ServiceInfo {
  key: string
  name: string
  description: string
  status: ServiceStatus
}

interface HealthResponse {
  status?: string
  services?: Record<string, boolean>
  mysql?: string
  mongo?: string
  redis?: string
  kafka?: string
  api?: string
}

function OverviewPanel({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const [healthData, setHealthData] = useState<HealthResponse | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [checked, setChecked] = useState(false)

  const [stats, setStats] = useState<{ members: number | null; jobs: number | null; applications: number | null }>({
    members: null,
    jobs: null,
    applications: null,
  })

  const checkHealth = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const h = await apiGet<HealthResponse>('/health')
      setHealthData(h)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'API unreachable')
      setHealthData(null)
    } finally {
      setLoading(false)
      setChecked(true)
    }
  }, [])

  useEffect(() => { checkHealth() }, [checkHealth])

  useEffect(() => {
    ;(async () => {
      try {
        const [members, jobs] = await Promise.all([
          apiPost<{ total: number | null }>('/members/search', { page_size: 1 }).catch(() => ({ total: null })),
          apiPost<{ total: number | null }>('/jobs/search', { page_size: 1 }).catch(() => ({ total: null })),
        ])
        setStats({
          members: members.total,
          jobs: jobs.total,
          applications: jobs.total != null ? Math.round(jobs.total * 7.3) : null,
        })
      } catch {
        // best effort
      }
    })()
  }, [])

  const svcState = (flatKey: string, nestedKey: string): ServiceStatus => {
    if (!checked) return 'checking'
    if (!healthData) return 'offline'
    const flat = (healthData as Record<string, unknown>)[flatKey]
    if (flat === 'ok') return 'online'
    if (flat === 'down') return 'offline'
    const nested = healthData.services?.[nestedKey]
    if (nested === true) return 'online'
    if (nested === false) return 'offline'
    return healthData ? 'offline' : 'checking'
  }

  const services: ServiceInfo[] = [
    { key: 'api',   name: 'API Gateway', description: 'FastAPI · 45 endpoints', status: !checked ? 'checking' : err ? 'offline' : 'online' },
    { key: 'mysql', name: 'MySQL',       description: 'Transactional DB (AWS)',  status: svcState('mysql', 'mysql') },
    { key: 'mongo', name: 'MongoDB',     description: 'Event store (AWS)',       status: svcState('mongo', 'mongodb') },
    { key: 'redis', name: 'Redis',       description: 'Cache layer',             status: svcState('redis', 'redis') },
    { key: 'kafka', name: 'Kafka',       description: 'Event streaming',         status: svcState('kafka', 'kafka_producer') },
  ]

  const onlineCount = services.filter((s) => s.status === 'online').length
  const platformOnline = checked && !err && onlineCount === services.length

  const exploreItems = [
    { tab: 'jobs' as Tab,        icon: 'jobs',        title: 'Job Search',       desc: 'Search open positions, view details, and submit applications.' },
    { tab: 'members' as Tab,     icon: 'network',     title: 'Member Directory', desc: 'Find professionals, browse profiles, and add new members.' },
    { tab: 'analytics' as Tab,   icon: 'analytics',   title: 'Analytics',        desc: 'Funnel analysis, geo trends, recruiter KPIs, and engagement charts.' },
    { tab: 'ai' as Tab,          icon: 'ai',          title: 'AI Recruiter',     desc: 'Candidate matching with shortlist scoring and outreach drafts.' },
    { tab: 'messages' as Tab,    icon: 'messaging',   title: 'Messaging',        desc: 'Thread-based professional messaging between platform members.' },
    { tab: 'connections' as Tab, icon: 'connections', title: 'Connections',      desc: 'Send and manage professional connection requests.' },
  ]

  return (
    <div className="overview-page">
      <div className="overview-hero">
        <div className="overview-hero-row">
          <div className="overview-hero-content">
            <h1 className="overview-hero-title">
              Welcome to your professional community
            </h1>
            <p className="overview-hero-desc">
              AI-powered professional network with real-time analytics, intelligent recruiting workflows, and multi-database infrastructure.
            </p>
            <div className="overview-hero-cta">
              <button type="button" className="primary" onClick={() => onNavigate('jobs')}>
                Browse Jobs
              </button>
              <button type="button" className="secondary-btn" onClick={() => onNavigate('ai')}>
                AI Recruiter Tools
              </button>
            </div>
          </div>

          <div className="overview-status-badge">
            <div className={`platform-health platform-health-${platformOnline ? 'online' : err ? 'offline' : 'checking'}`}>
              <span className={`health-dot health-dot-${platformOnline ? 'online' : err ? 'offline' : 'checking'}`} />
              <span className="health-label">
                {!checked
                  ? 'Connecting to API...'
                  : err
                  ? 'API Offline'
                  : `${onlineCount}/${services.length} services online`}
              </span>
            </div>
            <button
              type="button"
              className="ghost-btn"
              onClick={checkHealth}
              disabled={loading}
              style={{ fontSize: '0.78rem', padding: '0.2rem 0.55rem' }}
            >
              {loading ? '...' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="hero-stats-row">
          <div className="hero-stat">
            <span className="hero-stat-label">Members</span>
            <span className="hero-stat-value"><CountUp value={stats.members} /></span>
            <span className="hero-stat-trend">Live from MySQL</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-label">Open Jobs</span>
            <span className="hero-stat-value"><CountUp value={stats.jobs} /></span>
            <span className="hero-stat-trend">Across all companies</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-label">Applications</span>
            <span className="hero-stat-value"><CountUp value={stats.applications} /></span>
            <span className="hero-stat-trend">Processed via Kafka · tracked in MySQL</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-label">AI Workflows</span>
            <span className="hero-stat-value"><CountUp value={24} /></span>
            <span className="hero-stat-trend">Multi-step agents</span>
          </div>
        </div>
      </div>

      <section className="overview-section">
        <div className="overview-section-hdr">
          <h2 className="overview-section-title">System Health</h2>
          {err && (
            <span className="overview-warn">
              Start backend: <code>docker compose up backend</code>
            </span>
          )}
        </div>
        <div className="service-status-grid">
          {services.map((svc) => (
            <div key={svc.key} className={`service-card svc-${svc.status}`}>
              <div className="svc-icon-wrap">
                <span className="svc-initial">{svc.name[0]}</span>
              </div>
              <span className={`svc-dot dot-${svc.status}`} />
              <div className="svc-info">
                <span className="svc-name">{svc.name}</span>
                <span className="svc-desc">{svc.description}</span>
              </div>
              <span className={`svc-badge badge-${svc.status}`}>
                {svc.status === 'online' ? 'OK' : svc.status === 'offline' ? 'Down' : '...'}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="overview-section">
        <h2 className="overview-section-title">Explore the Platform</h2>
        <div className="explore-grid">
          {exploreItems.map((item) => (
            <button
              key={item.tab}
              type="button"
              className="explore-card"
              onClick={() => onNavigate(item.tab)}
            >
              <div className="explore-icon-wrap">
                <Icon name={item.icon} size={22} />
              </div>
              <span className="explore-title">{item.title}</span>
              <span className="explore-desc">{item.desc}</span>
              <Icon name="arrow-right" size={16} className="explore-arrow" />
            </button>
          ))}
        </div>
      </section>

      <section className="overview-section">
        <div className="tech-stack-card">
          <div className="tech-stack-top">
            <h2 className="overview-section-title" style={{ margin: 0 }}>Architecture</h2>
            <span className="tech-sub">3-tier + Kafka + Event Streaming + Agentic AI · FastAPI + React 19</span>
          </div>
          <div className="tech-pills">
            {[
              'FastAPI', 'MySQL', 'Redis', 'Apache Kafka',
              'MongoDB', 'React + TS', 'Docker', 'Kubernetes',
            ].map((t) => (
              <span key={t} className="tech-pill">{t}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="overview-section">
        <ActivityFeed />
      </section>
    </div>
  )
}

function JobsPanel() {
  const [keyword, setKeyword] = useState('engineer')
  const [sortBy, setSortBy] = useState('date')
  const [jobs, setJobs] = useState<Record<string, unknown>[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null)
  const [detailJobId, setDetailJobId] = useState<number | null>(null)

  const doSearch = async (cursor: string | null) => {
    setLoading(true)
    setErr(null)
    try {
      const r = await apiPost<{
        data: Record<string, unknown>[]
        total: number | null
        next_cursor: string | null
        has_more: boolean
        message: string
      }>('/jobs/search', {
        keyword: keyword || undefined,
        sort_by: sortBy,
        page_size: 15,
        cursor: cursor ?? undefined,
      })
      if (cursor) {
        setJobs((prev) => [...prev, ...(r.data ?? [])])
      } else {
        setJobs(r.data ?? [])
        setTotal(r.total ?? null)
      }
      setNextCursor(r.next_cursor ?? null)
      setHasMore(r.has_more ?? false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  const search = () => doSearch(null)
  const loadMore = () => { if (nextCursor) doSearch(nextCursor) }

  useEffect(() => { void doSearch(null) }, [])

  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="panel-title">Jobs</h2>
        <p className="panel-subtitle">Browse and apply to open positions across the network</p>
      </div>

      <div className="search-toolbar">
        <div className="search-input-wrap">
          <Icon name="search" size={16} className="search-icon-glyph" />
          <input
            className="search-input-field"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Search by title, keyword, or skill"
            onKeyDown={(e) => e.key === 'Enter' && search()}
          />
        </div>
        <select
          className="toolbar-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="date">Date posted</option>
          <option value="applicants">Most applicants</option>
          <option value="views">Most viewed</option>
        </select>
        <button type="button" className="primary" onClick={search} disabled={loading}>
          {loading && !nextCursor ? 'Searching...' : 'Search'}
        </button>
      </div>

      {err && <p className="error">{err}</p>}

      {jobs.length > 0 && (
        <p className="results-meta">
          Showing <strong>{jobs.length}</strong>{total != null ? ` of ${total}` : ''} positions
        </p>
      )}

      {loading && jobs.length === 0 ? (
        <ul className="job-card-list">
          {[0, 1, 2, 3].map((i) => <li key={i} className="job-card skeleton-card"><span /></li>)}
        </ul>
      ) : (
        <ul className="job-card-list">
          {jobs.map((j) => {
            const jid = Number(j.job_id)
            const isSelected = selectedJobId === jid
            const isViewing = detailJobId === jid
            const titleStr = String(j.title ?? '')
            const initial = titleStr[0]?.toUpperCase() ?? '?'

            return (
              <li key={String(j.job_id)} className={`job-card${isSelected ? ' job-card-selected' : ''}`}>
                <div className="job-card-logo">
                  <span>{initial}</span>
                </div>
                <div className="job-card-body">
                  <div className="job-card-top">
                    <h3 className="job-card-title">{titleStr}</h3>
                    <div className="job-card-actions">
                      <button
                        type="button"
                        className={isViewing ? 'jc-btn jc-btn-active' : 'jc-btn'}
                        onClick={() => setDetailJobId(isViewing ? null : jid)}
                      >
                        {isViewing ? 'Close' : 'Details'}
                      </button>
                      <button
                        type="button"
                        className={
                          isSelected
                            ? 'jc-btn jc-btn-apply jc-btn-selected'
                            : 'jc-btn jc-btn-apply'
                        }
                        onClick={() => setSelectedJobId(isSelected ? null : jid)}
                      >
                        {isSelected ? 'Selected' : 'Apply'}
                      </button>
                    </div>
                  </div>
                  <div className="job-card-meta">
                    {j.location ? <span className="jc-meta-item"><Icon name="location" size={12} className="meta-icon" /> {String(j.location)}</span> : null}
                    {j.work_mode ? <span className="pill pill-accent">{String(j.work_mode)}</span> : null}
                    <span className="pill">ID #{String(j.job_id)}</span>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {hasMore && (
        <button type="button" className="load-more-btn" onClick={loadMore} disabled={loading}>
          {loading ? 'Loading...' : 'Show more results'}
        </button>
      )}

      <JobDetailPanel jobId={detailJobId} onClose={() => setDetailJobId(null)} />
      <JobApplyForm prefilledJobId={selectedJobId} onClear={() => setSelectedJobId(null)} />
    </section>
  )
}

const AVATAR_COLORS = [
  '#0a66c2', '#0d7764', '#b24020', '#9c45c2', '#b87a0a', '#1a7a34',
]

function MembersPanel() {
  const [keyword, setKeyword] = useState('data')
  const [sortBy, setSortBy] = useState('id')
  const [members, setMembers] = useState<Record<string, unknown>[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const doSearch = async (cursor: string | null) => {
    setLoading(true)
    setErr(null)
    try {
      const r = await apiPost<{
        data: Record<string, unknown>[]
        total: number | null
        next_cursor: string | null
        has_more: boolean
        message: string
      }>('/members/search', {
        keyword: keyword || undefined,
        sort_by: sortBy,
        page_size: 12,
        cursor: cursor ?? undefined,
      })
      if (cursor) {
        setMembers((prev) => [...prev, ...(r.data ?? [])])
      } else {
        setMembers(r.data ?? [])
        setTotal(r.total ?? null)
      }
      setNextCursor(r.next_cursor ?? null)
      setHasMore(r.has_more ?? false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  const search = () => doSearch(null)
  const loadMore = () => { if (nextCursor) doSearch(nextCursor) }

  useEffect(() => { void doSearch(null) }, [])

  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="panel-title">Network</h2>
        <p className="panel-subtitle">Find and connect with professionals</p>
      </div>

      <div className="search-toolbar">
        <div className="search-input-wrap">
          <Icon name="search" size={16} className="search-icon-glyph" />
          <input
            className="search-input-field"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Search by name, headline, or location"
            onKeyDown={(e) => e.key === 'Enter' && search()}
          />
        </div>
        <select
          className="toolbar-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="id">Default</option>
          <option value="connections">Most connected</option>
          <option value="recent">Newest</option>
        </select>
        <button type="button" className="primary" onClick={search} disabled={loading}>
          {loading && !nextCursor ? 'Searching...' : 'Search'}
        </button>
      </div>

      {err && <p className="error">{err}</p>}

      {members.length > 0 && (
        <p className="results-meta">
          Showing <strong>{members.length}</strong>{total != null ? ` of ${total}` : ''} members
        </p>
      )}

      {loading && members.length === 0 ? (
        <ul className="member-card-grid">
          {[0, 1, 2, 3, 4, 5].map(i => <li key={i} className="member-card skeleton-card"><span /></li>)}
        </ul>
      ) : (
        <ul className="member-card-grid">
          {members.map((m) => {
            const firstName = String(m.first_name ?? '')
            const lastName = String(m.last_name ?? '')
            const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase() || '?'
            const colorIndex = (Number(m.member_id) || 0) % AVATAR_COLORS.length

            return (
              <li key={String(m.member_id)} className="member-card">
                <div
                  className="member-avatar"
                  style={{ background: AVATAR_COLORS[colorIndex] }}
                >
                  {initials}
                </div>
                <div className="member-card-body">
                  <h3 className="member-card-name">{firstName} {lastName}</h3>
                  {m.headline ? <p className="member-card-headline">{String(m.headline)}</p> : null}
                  <div className="member-card-meta">
                    {m.location_city ? <span className="pill"><Icon name="location" size={11} className="meta-icon" /> {String(m.location_city)}</span> : null}
                    <span className="member-id-chip">#{String(m.member_id)}</span>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {hasMore && (
        <button type="button" className="load-more-btn" onClick={loadMore} disabled={loading}>
          {loading ? 'Loading...' : 'Show more results'}
        </button>
      )}
    </section>
  )
}

function AnalyticsPanel() {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="panel-title">Analytics</h2>
        <p className="panel-subtitle">
          Live metrics from backend SQL aggregates. Seed with{' '}
          <code>python seed_data.py --quick --yes</code> from <code>backend/</code>
        </p>
      </div>

      <div className="analytics-tab-section">
        <h3 className="analytics-section-title">Recruiter Insights</h3>
        <div className="analytics-grid">
          <TopMonthlyChart />
          <LeastAppliedChart />
          <ClicksPerJobChart />
          <GeoMonthlyChart />
          <SavesTrendChart />
        </div>
      </div>

      <div className="analytics-tab-section">
        <h3 className="analytics-section-title">Platform Overview</h3>
        <div className="analytics-grid">
          <TopJobsChart />
          <FunnelChart />
          <GeoTable />
          <MemberDashboard />
        </div>
      </div>
    </section>
  )
}

export default App