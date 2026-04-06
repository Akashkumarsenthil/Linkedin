import { useCallback, useState } from 'react'
import './App.css'
import { apiGet, apiPost } from './api'
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

type Tab = 'overview' | 'jobs' | 'members' | 'analytics' | 'ai' | 'messages' | 'connections' | 'auth'

function App() {
  const [tab, setTab] = useState<Tab>('overview')

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo-dot" aria-hidden />
          <div>
            <h1>LinkedIn Agentic AI</h1>
            <p className="tagline">DATA236 demo console</p>
          </div>
        </div>
        <nav className="nav" aria-label="Primary">
          {(
            [
              ['overview', 'Overview'],
              ['jobs', 'Jobs'],
              ['members', 'Members'],
              ['analytics', 'Analytics'],
              ['messages', 'Messages'],
              ['connections', 'Connections'],
              ['ai', 'AI tools'],
              ['auth', 'Auth'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={tab === id ? 'nav-btn active' : 'nav-btn'}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="main">
        {tab === 'overview' && <OverviewPanel />}
        {tab === 'jobs' && <JobsPanel />}
        {tab === 'members' && <MembersPanel />}
        {tab === 'analytics' && <AnalyticsPanel />}
        {tab === 'messages' && <MessagingPanel />}
        {tab === 'connections' && <ConnectionsPanel />}
        {tab === 'ai' && <AiDashboard />}
        {tab === 'auth' && <AuthPanel />}
      </main>

      <footer className="footer">
        API docs: <code>/docs</code> · OpenAPI: <code>docs/openapi.json</code> · Postman:{' '}
        <code>postman/</code>
      </footer>
    </div>
  )
}

function OverviewPanel() {
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const h = await apiGet<Record<string, unknown>>('/health')
      setData(h)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <section className="panel">
      <h2>Service health</h2>
      <p className="hint">
        Starts the FastAPI app with Docker infra (MySQL, Redis, MongoDB, Kafka). If the API is
        down, run <code>uvicorn main:app --reload</code> from <code>backend/</code>.
      </p>
      <button type="button" className="primary" onClick={load} disabled={loading}>
        {loading ? 'Checking…' : 'Refresh health'}
      </button>
      {err && <p className="error">{err}</p>}
      {data && (
        <pre className="json-out">{JSON.stringify(data, null, 2)}</pre>
      )}
    </section>
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

  return (
    <section className="panel">
      <h2>Job search</h2>
      <div className="row">
        <label>
          Keyword
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="e.g. engineer"
            onKeyDown={(e) => e.key === 'Enter' && search()}
          />
        </label>
        <label>
          Sort
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{ fontFamily: 'inherit', fontSize: '0.875rem', padding: '0.5rem 0.65rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)' }}
          >
            <option value="date">Date posted</option>
            <option value="applicants">Most applicants</option>
            <option value="views">Most viewed</option>
          </select>
        </label>
        <button type="button" className="primary" onClick={search} disabled={loading}>
          {loading && !nextCursor ? 'Searching…' : 'Search'}
        </button>
      </div>
      {err && <p className="error">{err}</p>}
      {jobs.length > 0 && (
        <p className="meta">
          Showing {jobs.length}{total != null ? ` of ${total}` : ''} jobs
        </p>
      )}
      <ul className="card-list">
        {jobs.map((j) => {
          const jid = Number(j.job_id)
          const isSelected = selectedJobId === jid
          const isViewing = detailJobId === jid
          return (
            <li key={String(j.job_id)} className={`card${isSelected ? ' card-selected' : ''}`}>
              <strong>{String(j.title)}</strong>
              <span className="muted">{String(j.location ?? '')}</span>
              <span className="pill">{String(j.work_mode ?? '')}</span>
              <span className="pill">ID #{String(j.job_id)}</span>
              <div className="card-actions">
                <button
                  type="button"
                  className={isViewing ? 'apply-btn apply-btn-active' : 'apply-btn'}
                  onClick={() => setDetailJobId(isViewing ? null : jid)}
                >
                  {isViewing ? 'Viewing ▴' : 'View'}
                </button>
                <button
                  type="button"
                  className={isSelected ? 'apply-btn apply-btn-active' : 'apply-btn'}
                  onClick={() => setSelectedJobId(isSelected ? null : jid)}
                >
                  {isSelected ? 'Selected ✓' : 'Apply'}
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      {hasMore && (
        <button
          type="button"
          className="load-more-btn"
          onClick={loadMore}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}

      <JobDetailPanel
        jobId={detailJobId}
        onClose={() => setDetailJobId(null)}
      />

      <JobApplyForm
        prefilledJobId={selectedJobId}
        onClear={() => setSelectedJobId(null)}
      />
    </section>
  )
}

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

  return (
    <section className="panel">
      <h2>Member search</h2>
      <div className="row">
        <label>
          Keyword
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="name, headline, about"
            onKeyDown={(e) => e.key === 'Enter' && search()}
          />
        </label>
        <label>
          Sort
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{ fontFamily: 'inherit', fontSize: '0.875rem', padding: '0.5rem 0.65rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)' }}
          >
            <option value="id">Default</option>
            <option value="connections">Most connected</option>
            <option value="recent">Newest</option>
          </select>
        </label>
        <button type="button" className="primary" onClick={search} disabled={loading}>
          {loading && !nextCursor ? 'Searching…' : 'Search'}
        </button>
      </div>
      {err && <p className="error">{err}</p>}
      {members.length > 0 && (
        <p className="meta">
          Showing {members.length}{total != null ? ` of ${total}` : ''} members
        </p>
      )}
      <ul className="card-list">
        {members.map((m) => (
          <li key={String(m.member_id)} className="card">
            <strong>
              {String(m.first_name)} {String(m.last_name)}
            </strong>
            <span className="muted">{String(m.headline ?? '')}</span>
            {m.location_city && (
              <span className="pill">{String(m.location_city)}</span>
            )}
          </li>
        ))}
      </ul>

      {hasMore && (
        <button
          type="button"
          className="load-more-btn"
          onClick={loadMore}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}

      <MemberCreateForm />
    </section>
  )
}

function AnalyticsPanel() {
  return (
    <section className="panel">
      <h2>Analytics</h2>
      <p className="hint">
        Live charts powered by the backend SQL aggregates. Requires seeded data —
        run <code>python seed_data.py --quick --yes</code> from <code>backend/</code> if
        charts show empty results.
      </p>

      <h3 className="analytics-section-title">Recruiter / Admin Dashboard</h3>
      <div className="analytics-grid">
        <TopMonthlyChart />
        <LeastAppliedChart />
        <ClicksPerJobChart />
        <GeoMonthlyChart />
        <SavesTrendChart />
      </div>

      <h3 className="analytics-section-title">General Analytics</h3>
      <div className="analytics-grid">
        <TopJobsChart />
        <FunnelChart />
        <GeoTable />
        <MemberDashboard />
      </div>
    </section>
  )
}

export default App
