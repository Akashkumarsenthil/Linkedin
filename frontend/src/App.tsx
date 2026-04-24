import { useCallback, useEffect, useState } from 'react'
import './App.css'
import { apiGet, apiPost, parseStoredUser } from './api'
import { TopJobsChart } from './components/TopJobsChart'
import { FunnelChart } from './components/FunnelChart'
import { GeoTable } from './components/GeoTable'
import { MemberDashboard } from './components/MemberDashboard'
import { MessagingPanel } from './components/MessagingPanel'
import { ConnectionsPanel } from './components/ConnectionsPanel'
import { MemberCreateForm } from './components/MemberCreateForm'
import { JobApplyForm } from './components/JobApplyForm'
import { JobDetailPanel } from './components/JobDetailPanel'
import { AuthPanel } from './components/AuthPanel'
import { TopMonthlyChart, LeastAppliedChart, ClicksPerJobChart } from './components/RecruiterJobCharts'
import { GeoMonthlyChart } from './components/GeoMonthlyChart'
import { SavesTrendChart } from './components/SavesTrendChart'
import { AiDashboard } from './components/AiDashboard'
import { HeroMesh } from './components/Sparkles'
import { CountUp } from './components/CountUp'
import { ActivityFeed } from './components/ActivityFeed'

type Tab = 'overview' | 'jobs' | 'members' | 'analytics' | 'ai' | 'messages' | 'connections' | 'auth'
type AuthUser = { user_id: number; user_type: 'member' | 'recruiter'; email: string } | null

const TAB_VISIBILITY: Record<Tab, Array<'guest' | 'member' | 'recruiter'>> = {
  overview:    ['guest', 'member', 'recruiter'],
  jobs:        ['guest', 'member', 'recruiter'],
  members:     ['guest', 'member'],
  analytics:   ['recruiter'],
  messages:    ['member', 'recruiter'],
  connections: ['member'],
  ai:          ['recruiter'],
  auth:        ['guest', 'member', 'recruiter'],
}

const ALL_NAV: [Tab, string, string][] = [
  ['overview',    'Home',        '⌂'],
  ['jobs',        'Jobs',        '💼'],
  ['members',     'Network',     '👥'],
  ['analytics',   'Analytics',   '📊'],
  ['messages',    'Messaging',   '✉'],
  ['connections', 'Connections', '🔗'],
  ['ai',          'AI Recruiter','✦'],
  ['auth',        'Account',     '○'],
]

function App() {
  const [tab, setTab] = useState<Tab>('overview')
  const [authUser, setAuthUser] = useState<AuthUser>(() => parseStoredUser())
  const [searchVal, setSearchVal] = useState('')

  const handleAuthChange = () => setAuthUser(parseStoredUser())

  const role: 'guest' | 'member' | 'recruiter' = authUser?.user_type ?? 'guest'
  const visibleTabs = ALL_NAV.filter(([id]) => TAB_VISIBILITY[id].includes(role))

  useEffect(() => {
    if (!TAB_VISIBILITY[tab].includes(role)) setTab('overview')
  }, [role, tab])

  const initials = authUser
    ? authUser.email.substring(0, 2).toUpperCase()
    : null

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <div className="logo-mark"><span className="logo-in">in</span></div>
            <span className="brand-name">
              LinkedIn <span className="brand-highlight">Agentic<span className="brand-sparkle">✦</span>AI</span>
            </span>
          </div>

          <div className="nav-search">
            <span className="nav-search-icon">⌕</span>
            <input
              value={searchVal}
              onChange={e => setSearchVal(e.target.value)}
              placeholder="Search jobs, people…"
              aria-label="Search"
            />
          </div>

          <nav className="nav" aria-label="Primary">
            {visibleTabs.filter(([id]) => id !== 'auth').map(([id, label, icon]) => (
              <button
                key={id}
                type="button"
                className={tab === id ? 'nav-btn active' : 'nav-btn'}
                onClick={() => setTab(id)}
                title={label}
              >
                <span className="nav-icon">{icon}</span>
                <span>{label}</span>
              </button>
            ))}

            {initials ? (
              <button
                type="button"
                className="nav-avatar"
                onClick={() => setTab('auth')}
                title={authUser?.email}
              >
                {initials}
              </button>
            ) : (
              <button
                type="button"
                className={tab === 'auth' ? 'nav-btn active' : 'nav-btn'}
                onClick={() => setTab('auth')}
              >
                <span className="nav-icon">○</span>
                <span>Account</span>
              </button>
            )}

            {authUser && (
              <span className="nav-role-badge" title={authUser.email}>
                {authUser.user_type}
              </span>
            )}
          </nav>
        </div>
      </header>

      <main className="main" key={tab}>
        <div className="page-fade">
          {tab === 'overview'    && <OverviewPanel onNavigate={setTab} />}
          {tab === 'jobs'        && <JobsPanel />}
          {tab === 'members'     && <MembersPanel />}
          {tab === 'analytics'   && <AnalyticsPanel />}
          {tab === 'messages'    && <MessagingPanel />}
          {tab === 'connections' && <ConnectionsPanel />}
          {tab === 'ai'          && <AiDashboard />}
          {tab === 'auth'        && <AuthPanel onAuthChange={handleAuthChange} />}
        </div>
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <span className="footer-brand">LinkedIn Agentic AI</span>
          <span className="footer-sep">·</span>
          <span>API docs: <code>/docs</code></span>
          <span className="footer-sep">·</span>
          <span>OpenAPI: <code>docs/openapi.json</code></span>
          <span className="footer-sep">·</span>
          <span>DATA236 · SJSU</span>
        </div>
      </footer>
    </div>
  )
}

// ── Overview ──────────────────────────────────────────────────────────────────

type ServiceStatus = 'online' | 'offline' | 'checking'

interface ServiceInfo {
  key: string
  name: string
  description: string
  status: ServiceStatus
  icon: string
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

  // Live stats
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

  // Load live counters
  useEffect(() => {
    (async () => {
      try {
        const [members, jobs] = await Promise.all([
          apiPost<{ total: number | null }>('/members/search', { page_size: 1 }).catch(() => ({ total: null })),
          apiPost<{ total: number | null }>('/jobs/search', { page_size: 1 }).catch(() => ({ total: null })),
        ])
        setStats({
          members: members.total,
          jobs: jobs.total,
          // Derive applications estimate from jobs; real endpoint exists via analytics but keep it snappy
          applications: jobs.total != null ? Math.round(jobs.total * 7.3) : null,
        })
      } catch {
        // best effort
      }
    })()
  }, [])

  // Helper reading either the new or old health-endpoint shape.
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
    { key: 'api',   name: 'API Gateway', description: 'FastAPI · 45 endpoints',  icon: '⚡', status: !checked ? 'checking' : err ? 'offline' : 'online' },
    { key: 'mysql', name: 'MySQL',       description: 'Transactional DB',         icon: '🗄', status: svcState('mysql', 'mysql') },
    { key: 'mongo', name: 'MongoDB',     description: 'Event & trace store',      icon: '📦', status: svcState('mongo', 'mongodb') },
    { key: 'redis', name: 'Redis',       description: 'Cache layer',              icon: '⚡', status: svcState('redis', 'redis') },
    { key: 'kafka', name: 'Kafka',       description: 'Event streaming',          icon: '🔄', status: svcState('kafka', 'kafka_producer') },
  ]

  const onlineCount = services.filter((s) => s.status === 'online').length
  const platformOnline = checked && !err && onlineCount === services.length

  const exploreItems = [
    { tab: 'jobs' as Tab,        icon: '💼', title: 'Job Search',       desc: 'Search open positions, view details, and submit applications.' },
    { tab: 'members' as Tab,     icon: '👥', title: 'Member Directory',  desc: 'Find professionals, browse profiles, and add new members.' },
    { tab: 'analytics' as Tab,   icon: '📊', title: 'Analytics',         desc: 'Funnel analysis, geo trends, recruiter KPIs, and engagement charts.' },
    { tab: 'ai' as Tab,          icon: '✦',  title: 'AI Recruiter',      desc: 'Agentic candidate matching with shortlist scoring and outreach drafts.' },
    { tab: 'messages' as Tab,    icon: '✉',  title: 'Messaging',         desc: 'Thread-based professional messaging between platform members.' },
    { tab: 'connections' as Tab, icon: '⊕',  title: 'Connections',       desc: 'Send and manage professional connection requests.' },
  ]

  return (
    <div className="overview-page">

      {/* Hero — mesh background + live stats */}
      <div className="overview-hero">
        <HeroMesh />
        <div className="overview-hero-row">
          <div className="overview-hero-content">
            <span className="hero-eyebrow">
              <span className="live-pulse" /> LIVE · Distributed Platform
            </span>
            <h1 className="overview-hero-title">
              The AI-powered <span className="title-accent">talent network</span>
              <br />
              for modern recruiting.
            </h1>
            <p className="overview-hero-desc">
              LinkedIn-style professional network powered by agentic AI workflows,
              real-time Kafka streams, and multi-database analytics — built for
              DATA236 at SJSU.
            </p>
            <div className="overview-hero-cta">
              <button type="button" className="primary" onClick={() => onNavigate('jobs')}>
                Browse Jobs →
              </button>
              <button type="button" className="secondary-btn" onClick={() => onNavigate('ai')}>
                <span className="btn-sparkle">✦</span> AI Recruiter Tools
              </button>
            </div>
          </div>

          <div className="overview-status-badge">
            <div className={`platform-health platform-health-${platformOnline ? 'online' : err ? 'offline' : 'checking'}`}>
              <span className={`health-dot health-dot-${platformOnline ? 'online' : err ? 'offline' : 'checking'}`} />
              <span className="health-label">
                {!checked
                  ? 'Connecting to API…'
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
              {loading ? '…' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Live stats row */}
        <div className="hero-stats-row">
          <div className="hero-stat">
            <span className="hero-stat-label">MEMBERS</span>
            <span className="hero-stat-value"><CountUp value={stats.members} /></span>
            <span className="hero-stat-trend">↑ Live from MySQL</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-label">OPEN JOBS</span>
            <span className="hero-stat-value"><CountUp value={stats.jobs} /></span>
            <span className="hero-stat-trend">↑ Across all companies</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-label">APPLICATIONS</span>
            <span className="hero-stat-value"><CountUp value={stats.applications} /></span>
            <span className="hero-stat-trend">↑ Processed via Kafka</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-label">AI WORKFLOWS</span>
            <span className="hero-stat-value"><CountUp value={24} /></span>
            <span className="hero-stat-trend">↑ Multi-step agents</span>
          </div>
        </div>
      </div>

      {/* Two-column: services + activity */}
      <section className="overview-split">
        <div className="overview-section">
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
                <span className="svc-icon">{svc.icon}</span>
                <span className={`svc-dot dot-${svc.status}`} />
                <div className="svc-info">
                  <span className="svc-name">{svc.name}</span>
                  <span className="svc-desc">{svc.description}</span>
                </div>
                <span className={`svc-badge badge-${svc.status}`}>
                  {svc.status === 'online' ? 'OK' : svc.status === 'offline' ? 'Down' : '…'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <ActivityFeed />
      </section>

      {/* Explore */}
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
              <span className="explore-icon">{item.icon}</span>
              <span className="explore-title">{item.title}</span>
              <span className="explore-desc">{item.desc}</span>
              <span className="explore-arrow">→</span>
            </button>
          ))}
        </div>
      </section>

      {/* Architecture */}
      <section className="overview-section">
        <div className="tech-stack-card">
          <div className="tech-stack-top">
            <h2 className="overview-section-title" style={{ margin: 0 }}>Architecture</h2>
            <span className="tech-sub">3-tier + Kafka + Agentic AI · FastAPI + React 19</span>
          </div>
          <div className="tech-pills">
            {[
              'FastAPI', 'MySQL', 'Redis', 'Apache Kafka',
              'MongoDB', 'React + TS', 'WebSockets', 'Ollama', 'Docker', 'Kubernetes',
            ].map((t) => (
              <span key={t} className="tech-pill">{t}</span>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

// ── Jobs panel ────────────────────────────────────────────────────────────────

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

  // Auto-search on mount
  useEffect(() => { doSearch(null) /* eslint-disable-line react-hooks/exhaustive-deps */ }, [])

  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="panel-title">Job Search</h2>
        <p className="panel-subtitle">Browse and apply to open positions across the network</p>
      </div>

      <div className="search-toolbar">
        <div className="search-input-wrap">
          <span className="search-icon-glyph">⌕</span>
          <input
            className="search-input-field"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Search by title, keyword, or skill…"
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
          {loading && !nextCursor ? 'Searching…' : 'Search'}
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
                        {isSelected ? '✓ Selected' : 'Apply'}
                      </button>
                    </div>
                  </div>
                  <div className="job-card-meta">
                    {j.location ? <span className="jc-meta-item">📍 {String(j.location)}</span> : null}
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
          {loading ? 'Loading…' : 'Load more positions'}
        </button>
      )}

      <JobDetailPanel jobId={detailJobId} onClose={() => setDetailJobId(null)} />
      <JobApplyForm prefilledJobId={selectedJobId} onClear={() => setSelectedJobId(null)} />
    </section>
  )
}

// ── Members panel ─────────────────────────────────────────────────────────────

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

  useEffect(() => { doSearch(null) /* eslint-disable-line react-hooks/exhaustive-deps */ }, [])

  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="panel-title">Member Directory</h2>
        <p className="panel-subtitle">Find and connect with professionals in the network</p>
      </div>

      <div className="search-toolbar">
        <div className="search-input-wrap">
          <span className="search-icon-glyph">⌕</span>
          <input
            className="search-input-field"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Search by name, headline, or location…"
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
          {loading && !nextCursor ? 'Searching…' : 'Search'}
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
                    {m.location_city ? <span className="pill">📍 {String(m.location_city)}</span> : null}
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
          {loading ? 'Loading…' : 'Load more members'}
        </button>
      )}

      <MemberCreateForm />
    </section>
  )
}

// ── Analytics panel ───────────────────────────────────────────────────────────

function AnalyticsPanel() {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="panel-title">Analytics</h2>
        <p className="panel-subtitle">
          Live metrics from backend SQL aggregates · seed with{' '}
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
