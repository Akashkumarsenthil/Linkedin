import { useEffect, useState, useCallback } from 'react'
import { apiGet, apiPost } from '../api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CacheStats {
  hits: number
  misses: number
  total: number
  hit_rate_pct: number
}

interface HealthResponse {
  status?: string
  services?: Record<string, boolean>
  mysql?: string
  mongo?: string
  redis?: string
  kafka?: string
  api?: string
  cache_stats?: CacheStats
}

interface KafkaEventType {
  event_type: string
  count: number
}

interface RecentEvent {
  event_type?: string
  timestamp?: string
  actor_id?: number | string
  entity?: string | Record<string, unknown>
  trace_id?: string
}

interface KafkaStats {
  status: string
  error?: string
  totals: {
    events_logged: number
    events_processed_unique: number
    dead_letters: number
    events_last_24h: number
    job_clicks_aggregated: number
    job_saves_aggregated: number
  }
  events_by_type: KafkaEventType[]
  recent_events: RecentEvent[]
}

interface MySQLStats {
  status: string
  error?: string
  totals: {
    members: number
    recruiters: number
    jobs: number
    applications: number
    connections: number
    messages: number
    posts: number
  }
  applications_by_status: { status: string; count: number }[]
  top_locations: { city: string; count: number }[]
  top_job_titles: { title: string; count: number }[]
}

type ServiceStatus = 'online' | 'offline' | 'checking'

// ── Human-readable event descriptions ────────────────────────────────────────

const EVENT_READABLE: Record<string, { icon: string; text: string; color: string }> = {
  'application.submitted': { icon: '📝', text: 'Someone applied for a job',         color: 'var(--accent)' },
  'job.viewed':            { icon: '👀', text: 'A job listing was viewed',           color: 'var(--text-sec)' },
  'job.saved':             { icon: '🔖', text: 'Someone bookmarked a job',           color: 'var(--warn)' },
  'job.created':           { icon: '💼', text: 'A new job was posted',               color: 'var(--success)' },
  'job.closed':            { icon: '🔒', text: 'A job listing was closed',           color: 'var(--text-muted)' },
  'profile.viewed':        { icon: '👤', text: "Someone's profile was viewed",       color: 'var(--accent)' },
  'connection.requested':  { icon: '🤝', text: 'Someone sent a connection request',  color: 'var(--success)' },
  'connection.accepted':   { icon: '🎉', text: 'A connection was accepted',          color: 'var(--success)' },
  'message.sent':          { icon: '💬', text: 'A new message was sent',             color: 'var(--accent)' },
  'ai.requested':          { icon: '🤖', text: 'AI recruiter was asked to help',     color: '#6d28d9' },
  'ai.step_completed':     { icon: '✅', text: 'AI recruiter completed a task',      color: '#6d28d9' },
}

function eventLabel(eventType: string): { icon: string; text: string; color: string } {
  return EVENT_READABLE[eventType] ?? { icon: '⚡', text: eventType.replace(/\./g, ' '), color: 'var(--text-sec)' }
}

function relativeTime(ts: string | undefined): string {
  if (!ts) return ''
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (diff < 60)  return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function entityLabel(entity: string | Record<string, unknown> | undefined): string {
  if (!entity) return ''
  if (typeof entity === 'object') return String(entity.entity_id ?? JSON.stringify(entity))
  return entity
}

// ── Shared UI primitives ──────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="li-card" style={{ padding: '16px 20px', ...style }}>
      {children}
    </div>
  )
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>{children}</h3>
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.5s ease' }} />
      </div>
      <span style={{ fontSize: 12, color: 'var(--text-sec)', minWidth: 36, textAlign: 'right' }}>{value.toFixed(1)}</span>
    </div>
  )
}

function KpiTile({ label, value, sub, color, icon }: {
  label: string; value: string; sub: string; color: string; icon: string
}) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1.2 }}>{icon} {value}</span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</span>
    </div>
  )
}

// ── Benchmark constants ───────────────────────────────────────────────────────

interface BenchResult {
  mode: string; scenario: string; throughput_rps: number
  mean_ms: number; p50_ms: number; p95_ms: number; p99_ms: number; error_rate: number
}

const BENCH_RESULTS: BenchResult[] = [
  { mode: 'B',       scenario: 'A', throughput_rps: 93.67, mean_ms: 8.4, p50_ms: 5.9, p95_ms: 24.1, p99_ms: 87.3, error_rate: 0 },
  { mode: 'B+S',     scenario: 'A', throughput_rps: 98.83, mean_ms: 2.9, p50_ms: 2.1, p95_ms: 5.8,  p99_ms: 14.2, error_rate: 0 },
  { mode: 'B+S+K',   scenario: 'A', throughput_rps: 98.03, mean_ms: 3.1, p50_ms: 2.2, p95_ms: 6.3,  p99_ms: 18.7, error_rate: 0 },
  { mode: 'B+S+K+O', scenario: 'A', throughput_rps: 99.27, mean_ms: 2.8, p50_ms: 2.0, p95_ms: 5.5,  p99_ms: 13.1, error_rate: 0 },
  { mode: 'B',       scenario: 'B', throughput_rps: 94.10, mean_ms: 8.2, p50_ms: 6.1, p95_ms: 16.7, p99_ms: 85.1, error_rate: 0 },
  { mode: 'B+S',     scenario: 'B', throughput_rps: 93.97, mean_ms: 8.4, p50_ms: 6.2, p95_ms: 17.1, p99_ms: 82.4, error_rate: 0 },
  { mode: 'B+S+K',   scenario: 'B', throughput_rps: 93.03, mean_ms: 9.7, p50_ms: 7.8, p95_ms: 19.4, p99_ms: 91.2, error_rate: 0 },
  { mode: 'B+S+K+O', scenario: 'B', throughput_rps: 94.47, mean_ms: 8.8, p50_ms: 6.9, p95_ms: 17.8, p99_ms: 79.6, error_rate: 0 },
]

const MODE_COLORS: Record<string, string> = {
  'B': '#cc1016', 'B+S': '#915907', 'B+S+K': '#0a66c2', 'B+S+K+O': '#057642',
}
const MODE_BG: Record<string, string> = {
  'B': 'rgba(204,16,22,0.08)', 'B+S': 'rgba(145,89,7,0.08)',
  'B+S+K': 'rgba(10,102,194,0.08)', 'B+S+K+O': 'rgba(5,118,66,0.08)',
}
const MODE_LABELS: Record<string, string> = {
  'B': 'Base — MySQL only', 'B+S': 'Base + Redis cache',
  'B+S+K': 'Base + Cache + Kafka', 'B+S+K+O': 'Full stack (optimised)',
}

// ── Live cache probe ──────────────────────────────────────────────────────────

function LiveCacheProbe() {
  const [latencies, setLatencies] = useState<{ cold: number | null; warm: number | null }>({ cold: null, warm: null })
  const [running, setRunning] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [error, setError] = useState(false)

  const runProbe = useCallback(async () => {
    setRunning(true); setLatencies({ cold: null, warm: null }); setSummary(null); setError(false)
    const payload = { keyword: 'engineer', page: 1, page_size: 10 }
    try {
      const t0 = performance.now()
      await apiPost('/jobs/search', payload)
      const cold = Math.round(performance.now() - t0)
      const t1 = performance.now()
      await apiPost('/jobs/search', payload)
      const warm = Math.round(performance.now() - t1)
      setLatencies({ cold, warm })
      setSummary(`${cold}ms → ${warm}ms · ${(cold / Math.max(warm, 1)).toFixed(1)}× speedup`)
    } catch {
      setError(true)
      setSummary('Backend offline — start with: docker compose up -d')
    } finally {
      setRunning(false)
    }
  }, [])

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <CardTitle>Live Cache Probe — /jobs/search</CardTitle>
        <button className="secondary-btn" onClick={runProbe} disabled={running} style={{ fontSize: 13 }}>
          {running ? 'Measuring…' : 'Run Probe'}
        </button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-sec)', marginBottom: summary ? 12 : 0 }}>
        Two identical requests back-to-back. First may be a cache miss (MySQL), second should hit Redis.
      </p>
      {summary && (
        <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 6, fontSize: 13, fontWeight: 500,
          background: error ? 'rgba(204,16,22,0.07)' : 'rgba(5,118,66,0.07)',
          border: `1px solid ${error ? 'rgba(204,16,22,0.2)' : 'rgba(5,118,66,0.2)'}`,
          color: error ? 'var(--error)' : 'var(--success)',
        }}>{summary}</div>
      )}
      {latencies.cold !== null && latencies.warm !== null && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
          {[
            { label: 'Cold (1st request)', ms: latencies.cold!, color: 'var(--error)' },
            { label: 'Warm (2nd request)', ms: latencies.warm!, color: 'var(--success)' },
          ].map(({ label, ms, color }) => (
            <div key={label} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 26, fontWeight: 700, color }}>
                {ms}<span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>ms</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-sec)', marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function PerformanceDashboard() {
  const [health, setHealth]           = useState<HealthResponse | null>(null)
  const [healthChecked, setHealthChecked] = useState(false)
  const [cacheStats, setCacheStats]   = useState<CacheStats | null>(null)
  const [activeScenario, setActiveScenario] = useState<'A' | 'B'>('A')
  const [activeMetric, setActiveMetric]     = useState<'p95_ms' | 'throughput_rps'>('p95_ms')
  const [kafkaStats, setKafkaStats]   = useState<KafkaStats | null>(null)
  const [kafkaLoading, setKafkaLoading] = useState(true)
  const [mysqlStats, setMysqlStats]   = useState<MySQLStats | null>(null)
  const [mysqlLoading, setMysqlLoading] = useState(true)

  const fetchHealth = useCallback(async () => {
    try {
      const h = await apiGet<HealthResponse>('/health')
      setHealth(h)
      setCacheStats(h.cache_stats ?? null)
    } catch {
      setHealth(null)
    } finally {
      setHealthChecked(true)
    }
  }, [])

  const fetchKafkaStats = useCallback(async () => {
    try { setKafkaStats(await apiGet<KafkaStats>('/perf/kafka-stats')) }
    catch { setKafkaStats(null) }
    finally { setKafkaLoading(false) }
  }, [])

  const fetchMysqlStats = useCallback(async () => {
    try { setMysqlStats(await apiGet<MySQLStats>('/perf/mysql-stats')) }
    catch { setMysqlStats(null) }
    finally { setMysqlLoading(false) }
  }, [])

  useEffect(() => {
    fetchHealth(); fetchKafkaStats(); fetchMysqlStats()
    const i1 = setInterval(fetchHealth, 5000)
    const i2 = setInterval(fetchKafkaStats, 10000)
    const i3 = setInterval(fetchMysqlStats, 15000)
    return () => { clearInterval(i1); clearInterval(i2); clearInterval(i3) }
  }, [fetchHealth, fetchKafkaStats, fetchMysqlStats])

  // Service health helpers (same logic as OverviewPanel)
  const svcState = (flatKey: string, nestedKey: string): ServiceStatus => {
    if (!healthChecked) return 'checking'
    if (!health) return 'offline'
    const flat = (health as Record<string, unknown>)[flatKey]
    if (flat === 'ok') return 'online'
    if (flat === 'down') return 'offline'
    const nested = health.services?.[nestedKey]
    if (nested === true) return 'online'
    if (nested === false) return 'offline'
    return 'offline'
  }

  const services = [
    { key: 'api',   name: 'API Gateway', desc: 'FastAPI · 45 endpoints',    status: !healthChecked ? 'checking' as ServiceStatus : !health ? 'offline' as ServiceStatus : 'online' as ServiceStatus },
    { key: 'mysql', name: 'MySQL',       desc: 'Transactional DB',           status: svcState('mysql', 'mysql') },
    { key: 'mongo', name: 'MongoDB',     desc: 'Event store',                status: svcState('mongo', 'mongodb') },
    { key: 'redis', name: 'Redis',       desc: 'Cache layer',                status: svcState('redis', 'redis') },
    { key: 'kafka', name: 'Kafka',       desc: 'Event streaming',            status: svcState('kafka', 'kafka_producer') },
  ]
  const onlineCount   = services.filter(s => s.status === 'online').length
  const redisOnline   = services.find(s => s.key === 'redis')?.status === 'online'
  const scenarioResults = BENCH_RESULTS.filter(r => r.scenario === activeScenario)
  const maxVal          = Math.max(...scenarioResults.map(r => r[activeMetric]))
  const aResults = BENCH_RESULTS.filter(r => r.scenario === 'A')
  const bBase    = aResults.find(r => r.mode === 'B')
  const bCached  = aResults.find(r => r.mode === 'B+S')
  const p95Improvement = bBase && bCached
    ? Math.round(((bBase.p95_ms - bCached.p95_ms) / bBase.p95_ms) * 100) : null

  const statusColor = (s: ServiceStatus) =>
    s === 'online' ? 'var(--success)' : s === 'offline' ? 'var(--error)' : 'var(--text-muted)'
  const statusLabel = (s: ServiceStatus) =>
    s === 'online' ? 'Online' : s === 'offline' ? 'Offline' : '…'

  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="panel-title">Performance Dashboard</h2>
        <p className="panel-subtitle">System health · MySQL · Redis · Kafka pipeline · Benchmark results</p>
      </div>

      {/* ── System Health ── */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <CardTitle>System Health</CardTitle>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: onlineCount === services.length ? 'var(--success)' : 'var(--error)', fontWeight: 600 }}>
              {healthChecked ? `${onlineCount}/${services.length} services online` : 'Checking…'}
            </span>
            <button className="ghost-btn" onClick={fetchHealth} style={{ fontSize: 12 }}>↻ Refresh</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          {services.map(svc => (
            <div key={svc.key} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 14px', borderRadius: 8,
              background: 'var(--surface2)', border: '1px solid var(--border)',
              borderLeft: `3px solid ${statusColor(svc.status)}`,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                background: `color-mix(in srgb, ${statusColor(svc.status)} 12%, transparent)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700, color: statusColor(svc.status),
              }}>
                {svc.name[0]}
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{svc.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{svc.desc}</div>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                background: `color-mix(in srgb, ${statusColor(svc.status)} 12%, transparent)`,
                color: statusColor(svc.status),
              }}>
                {statusLabel(svc.status)}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* ── KPI row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <KpiTile label="Redis"          value={redisOnline ? 'Online' : 'Offline'}              sub="Cache layer"         color={redisOnline ? 'var(--success)' : 'var(--error)'}  icon="⚡" />
        <KpiTile label="Cache Hits"     value={cacheStats ? cacheStats.hits.toLocaleString() : '—'}    sub="Since last restart"  color="var(--success)"   icon="✓" />
        <KpiTile label="Cache Misses"   value={cacheStats ? cacheStats.misses.toLocaleString() : '—'}  sub="Since last restart"  color="var(--warn)"      icon="✗" />
        <KpiTile label="Hit Rate"       value={cacheStats ? `${cacheStats.hit_rate_pct}%` : '—'}       sub="hits / total"        color={cacheStats && cacheStats.hit_rate_pct >= 70 ? 'var(--success)' : 'var(--warn)'} icon="📊" />
        <KpiTile label="P95 Improvement" value={p95Improvement !== null ? `${p95Improvement}%` : '—'}  sub="B → B+S reads"       color="var(--accent)"    icon="↓" />
      </div>

      {/* ── MySQL live stats ── */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <CardTitle>MySQL — Live Table Counts</CardTitle>
          <button className="ghost-btn" onClick={fetchMysqlStats} style={{ fontSize: 12 }}>↻ Refresh</button>
        </div>
        {mysqlLoading ? (
          <p style={{ fontSize: 13, color: 'var(--text-sec)' }}>Querying MySQL…</p>
        ) : mysqlStats?.status === 'ok' ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 16 }}>
              {([
                { label: 'Members',      value: mysqlStats.totals.members,      color: 'var(--accent)' },
                { label: 'Recruiters',   value: mysqlStats.totals.recruiters,   color: 'var(--accent)' },
                { label: 'Jobs',         value: mysqlStats.totals.jobs,         color: 'var(--success)' },
                { label: 'Applications', value: mysqlStats.totals.applications, color: 'var(--success)' },
                { label: 'Connections',  value: mysqlStats.totals.connections,  color: 'var(--warn)' },
                { label: 'Messages',     value: mysqlStats.totals.messages,     color: 'var(--warn)' },
                { label: 'Posts',        value: mysqlStats.totals.posts,        color: 'var(--text-sec)' },
              ] as { label: string; value: number; color: string }[]).map(({ label, value, color }) => (
                <div key={label} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color }}>{value.toLocaleString()}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
              {mysqlStats.applications_by_status.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Applications by Status</div>
                  {mysqlStats.applications_by_status.map(({ status, count }) => (
                    <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 5 }}>
                      <span style={{ color: 'var(--text-sec)', minWidth: 80 }}>{status}</span>
                      <div style={{ flex: 1, height: 7, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round((count / (mysqlStats.applications_by_status[0]?.count || 1)) * 100)}%`, height: '100%', background: 'var(--accent)', borderRadius: 4 }} />
                      </div>
                      <span style={{ color: 'var(--text-muted)', minWidth: 28, textAlign: 'right' }}>{count}</span>
                    </div>
                  ))}
                </div>
              )}
              {mysqlStats.top_locations.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Top Member Locations</div>
                  {mysqlStats.top_locations.map(({ city, count }) => (
                    <div key={city} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 5 }}>
                      <span style={{ color: 'var(--text-sec)', minWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{city}</span>
                      <div style={{ flex: 1, height: 7, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round((count / (mysqlStats.top_locations[0]?.count || 1)) * 100)}%`, height: '100%', background: 'var(--success)', borderRadius: 4 }} />
                      </div>
                      <span style={{ color: 'var(--text-muted)', minWidth: 28, textAlign: 'right' }}>{count}</span>
                    </div>
                  ))}
                </div>
              )}
              {mysqlStats.top_job_titles.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Top Job Titles</div>
                  {mysqlStats.top_job_titles.map(({ title, count }) => (
                    <div key={title} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 5 }}>
                      <span style={{ color: 'var(--text-sec)', minWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
                      <div style={{ flex: 1, height: 7, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round((count / (mysqlStats.top_job_titles[0]?.count || 1)) * 100)}%`, height: '100%', background: 'var(--warn)', borderRadius: 4 }} />
                      </div>
                      <span style={{ color: 'var(--text-muted)', minWidth: 28, textAlign: 'right' }}>{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-sec)' }}>{mysqlStats?.error ?? 'Could not reach /perf/mysql-stats — ensure the backend is running.'}</p>
        )}
      </Card>

      {/* ── Live cache probe ── */}
      <LiveCacheProbe />

      {/* ── Benchmark bar chart ── */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <CardTitle>Benchmark — B / B+S / B+S+K / B+S+K+O</CardTitle>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['A', 'B'] as const).map(s => (
              <button key={s} onClick={() => setActiveScenario(s)}
                className={activeScenario === s ? 'primary' : 'ghost-btn'}
                style={{ fontSize: 12, padding: '4px 12px' }}>
                Scenario {s} {s === 'A' ? '(Reads)' : '(Writes)'}
              </button>
            ))}
            {(['p95_ms', 'throughput_rps'] as const).map(m => (
              <button key={m} onClick={() => setActiveMetric(m)}
                className={activeMetric === m ? 'primary' : 'ghost-btn'}
                style={{ fontSize: 12, padding: '4px 12px' }}>
                {m === 'p95_ms' ? 'P95 Latency' : 'Throughput'}
              </button>
            ))}
          </div>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-sec)', marginBottom: 16 }}>
          {activeScenario === 'A'
            ? 'Scenario A: Job search + detail view (read-heavy). 20 concurrent users, 30s. Redis pre-warmed in B+S modes.'
            : 'Scenario B: Application submit (DB write + Kafka event). 20 concurrent users, 30s. JWT auth via perf-test account.'}
          {' '}Source: load_tests/results.json
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {scenarioResults.map(r => (
            <div key={r.mode}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: MODE_BG[r.mode], color: MODE_COLORS[r.mode] }}>{r.mode}</span>
                  <span style={{ color: 'var(--text-sec)' }}>{MODE_LABELS[r.mode]}</span>
                </span>
              </div>
              <Bar value={r[activeMetric]} max={maxVal} color={MODE_COLORS[r.mode] || 'var(--accent)'} />
            </div>
          ))}
        </div>
        {activeScenario === 'A' && activeMetric === 'p95_ms' && p95Improvement !== null && (
          <div style={{ marginTop: 14, padding: '8px 12px', borderRadius: 6, background: 'rgba(5,118,66,0.07)', border: '1px solid rgba(5,118,66,0.2)', fontSize: 13, color: 'var(--success)', fontWeight: 500 }}>
            Redis cache reduces P95 latency by <strong>{p95Improvement}%</strong> on read-heavy traffic — B: {bBase?.p95_ms}ms → B+S: {bCached?.p95_ms}ms
          </div>
        )}
      </Card>

      {/* ── Kafka pipeline ── */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <CardTitle>Kafka Event Pipeline — AWS MongoDB</CardTitle>
          <button className="ghost-btn" onClick={fetchKafkaStats} style={{ fontSize: 12 }}>↻ Refresh</button>
        </div>
        {kafkaLoading ? (
          <p style={{ fontSize: 13, color: 'var(--text-sec)' }}>Loading live data from MongoDB…</p>
        ) : kafkaStats?.status === 'ok' ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 16 }}>
              {([
                { label: 'Events Logged',    value: kafkaStats.totals.events_logged,           color: 'var(--accent)' },
                { label: 'Unique Processed', value: kafkaStats.totals.events_processed_unique, color: 'var(--success)' },
                { label: 'Dead Letters',     value: kafkaStats.totals.dead_letters,            color: kafkaStats.totals.dead_letters > 0 ? 'var(--error)' : 'var(--text-muted)' },
                { label: 'Last 24h',         value: kafkaStats.totals.events_last_24h,         color: 'var(--warn)' },
                { label: 'Job Clicks',       value: kafkaStats.totals.job_clicks_aggregated,   color: 'var(--accent)' },
                { label: 'Job Saves',        value: kafkaStats.totals.job_saves_aggregated,    color: 'var(--accent)' },
              ] as { label: string; value: number; color: string }[]).map(({ label, value, color }) => (
                <div key={label} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color }}>{value.toLocaleString()}</div>
                </div>
              ))}
            </div>
            {kafkaStats.events_by_type.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Events by Type</div>
                {kafkaStats.events_by_type.map(({ event_type, count }) => {
                  const { icon, text } = eventLabel(event_type)
                  const max = kafkaStats.events_by_type[0]?.count || 1
                  return (
                    <div key={event_type} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 6 }}>
                      <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
                      <span style={{ color: 'var(--text-sec)', minWidth: 200 }}>{text}</span>
                      <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round((count / max) * 100)}%`, height: '100%', background: 'var(--accent)', borderRadius: 4, transition: 'width 0.5s' }} />
                      </div>
                      <span style={{ color: 'var(--text-muted)', minWidth: 40, textAlign: 'right' }}>{count.toLocaleString()}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-sec)' }}>Could not reach /perf/kafka-stats — ensure the backend is running and MongoDB is reachable.</p>
        )}
      </Card>

      {/* ── Live Activity Feed (human-readable) ── */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', display: 'inline-block', flexShrink: 0 }} />
          <CardTitle>Live Activity Feed</CardTitle>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>Updates every 10s</span>
        </div>
        {kafkaLoading ? (
          <p style={{ fontSize: 13, color: 'var(--text-sec)' }}>Connecting to live activity…</p>
        ) : kafkaStats?.status === 'ok' && kafkaStats.recent_events.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {kafkaStats.recent_events.slice(0, 10).map((ev, i) => {
              const eventType = ev.event_type ?? 'unknown'
              const { icon, text, color } = eventLabel(eventType)
              const when = relativeTime(ev.timestamp)
              const entity = entityLabel(ev.entity)
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', borderRadius: 8,
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{text}</div>
                    {entity && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        Related to: {entity}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color, padding: '2px 8px', borderRadius: 20, background: `color-mix(in srgb, ${color} 10%, transparent)` }}>
                      {eventType.split('.')[0]}
                    </div>
                    {when && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{when}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-sec)', margin: 0 }}>
            {kafkaStats?.status === 'ok'
              ? 'No recent activity — run the seed script or use the platform to generate events.'
              : 'Live activity unavailable — backend or MongoDB offline.'}
          </p>
        )}
      </Card>

      {/* ── Full results table ── */}
      <Card>
        <CardTitle>Full Benchmark Results — 20 users · 30s · 0% error rate</CardTitle>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                {['Mode', 'Scenario', 'RPS', 'Mean', 'P50', 'P95', 'P99', 'Errors'].map(h => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-sec)', fontWeight: 600, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {BENCH_RESULTS.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface2)' }}>
                  <td style={{ padding: '7px 10px' }}>
                    <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: MODE_BG[r.mode], color: MODE_COLORS[r.mode] }}>{r.mode}</span>
                  </td>
                  <td style={{ padding: '7px 10px', color: r.scenario === 'A' ? 'var(--accent)' : 'var(--warn)', fontWeight: 600 }}>{r.scenario === 'A' ? 'A — Read' : 'B — Write'}</td>
                  <td style={{ padding: '7px 10px', color: 'var(--text)', fontWeight: 600 }}>{r.throughput_rps}</td>
                  <td style={{ padding: '7px 10px', color: 'var(--text-sec)' }}>{r.mean_ms}ms</td>
                  <td style={{ padding: '7px 10px', color: 'var(--text-sec)' }}>{r.p50_ms}ms</td>
                  <td style={{ padding: '7px 10px', color: r.p95_ms > 20 ? 'var(--warn)' : 'var(--success)', fontWeight: 600 }}>{r.p95_ms}ms</td>
                  <td style={{ padding: '7px 10px', color: 'var(--text-sec)' }}>{r.p99_ms}ms</td>
                  <td style={{ padding: '7px 10px', color: r.error_rate === 0 ? 'var(--success)' : 'var(--error)' }}>{r.error_rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Reproduce ── */}
      <Card style={{ background: 'var(--surface2)' }}>
        <CardTitle>Reproduce These Results</CardTitle>
        <pre style={{ fontSize: 12, color: 'var(--text-sec)', lineHeight: 1.8, overflowX: 'auto', margin: 0 }}>
{`# 1. Start services
docker compose up -d

# 2. Seed dataset + perf-test account
cd backend && python seed_data.py --yes

# 3. Run benchmark harness
cd load_tests && python perf_comparison.py --users 20 --duration 30 --json > results.json

# 4. Run cache benchmark
cd backend && python cache_benchmark.py --member-id 1 --repeats 10

# 5. Run Locust (interactive)
cd load_tests && locust -f locustfile.py --host http://localhost:8000`}
        </pre>
      </Card>
    </section>
  )
}
