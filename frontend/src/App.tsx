import { useCallback, useState } from 'react'
import './App.css'
import { apiGet, apiPost } from './api'
import { TopJobsChart } from './components/TopJobsChart'
import { FunnelChart } from './components/FunnelChart'
import { GeoTable } from './components/GeoTable'
import { MemberDashboard } from './components/MemberDashboard'
import { MessagingPanel } from './components/MessagingPanel'
import { ConnectionsPanel } from './components/ConnectionsPanel'
import { TopMonthlyChart, LeastAppliedChart, ClicksPerJobChart } from './components/RecruiterJobCharts'
import { GeoMonthlyChart } from './components/GeoMonthlyChart'
import { SavesTrendChart } from './components/SavesTrendChart'

type Tab = 'overview' | 'jobs' | 'members' | 'analytics' | 'ai' | 'messages' | 'connections'

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
        {tab === 'ai' && <AiPanel />}
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
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const search = async () => {
    setLoading(true)
    setErr(null)
    try {
      const r = await apiPost<Record<string, unknown>>('/jobs/search', {
        keyword: keyword || undefined,
        page: 1,
        page_size: 15,
      })
      setResult(r)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Search failed')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  const jobs = (result?.data as Record<string, unknown>[] | undefined) ?? []

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
          />
        </label>
        <button type="button" className="primary" onClick={search} disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>
      {err && <p className="error">{err}</p>}
      {result && (
        <p className="meta">
          {String(result.message ?? '')} · total {String(result.total ?? 0)}
        </p>
      )}
      <ul className="card-list">
        {jobs.map((j) => (
          <li key={String(j.job_id)} className="card">
            <strong>{String(j.title)}</strong>
            <span className="muted">{String(j.location ?? '')}</span>
            <span className="pill">{String(j.work_mode ?? '')}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function MembersPanel() {
  const [keyword, setKeyword] = useState('data')
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const search = async () => {
    setLoading(true)
    setErr(null)
    try {
      const r = await apiPost<Record<string, unknown>>('/members/search', {
        keyword: keyword || undefined,
        page: 1,
        page_size: 12,
      })
      setResult(r)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Search failed')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  const members = (result?.data as Record<string, unknown>[] | undefined) ?? []

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
          />
        </label>
        <button type="button" className="primary" onClick={search} disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>
      {err && <p className="error">{err}</p>}
      {result && <p className="meta">{String(result.message ?? '')}</p>}
      <ul className="card-list">
        {members.map((m) => (
          <li key={String(m.member_id)} className="card">
            <strong>
              {String(m.first_name)} {String(m.last_name)}
            </strong>
            <span className="muted">{String(m.headline ?? '')}</span>
          </li>
        ))}
      </ul>
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

function AiPanel() {
  const [text, setText] = useState(
    'Jane Smith | ML Engineer | jane@example.com\n\n5 years building recommendation systems with Python, PyTorch, and Spark. MS Statistics. Skills: Python, Kafka, AWS.',
  )
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const parse = async () => {
    setLoading(true)
    setErr(null)
    try {
      const r = await apiPost<Record<string, unknown>>('/ai/parse-resume', {
        resume_text: text,
      })
      setResult(r)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="panel">
      <h2>Parse resume (AI)</h2>
      <p className="hint">
        Calls the backend; uses Ollama when available, otherwise heuristic parsing.
      </p>
      <textarea
        className="resume-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        spellCheck={false}
      />
      <button type="button" className="primary" onClick={parse} disabled={loading}>
        {loading ? 'Parsing…' : 'Parse resume'}
      </button>
      {err && <p className="error">{err}</p>}
      {result && (
        <pre className="json-out">{JSON.stringify(result, null, 2)}</pre>
      )}
    </section>
  )
}

export default App
