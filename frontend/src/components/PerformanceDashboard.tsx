/**
 * PerformanceDashboard — displays live cache stats, benchmark results,
 * and latency/throughput charts directly from the backend.
 *
 * Scope: this component belongs to the performance/caching owner.
 * It reads from:
 *   GET  /health          → cache_stats (hit/miss counts)
 *   POST /jobs/search     → exercises the cached read path live
 *   POST /jobs/get        → exercises the cached entity path live
 *
 * The benchmark result tables are populated from the static results.json
 * data embedded at build time — they show the B / B+S / B+S+K / B+S+K+O
 * comparison required for the project report.
 */

import { useEffect, useState, useCallback } from 'react'
import { apiGet, apiPost } from '../api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CacheStats {
  hits: number
  misses: number
  total: number
  hit_rate_pct: number
}

interface HealthWithCache {
  cache_stats?: CacheStats
  redis?: string
  status?: string
}

interface KafkaEventType {
  event_type: string
  count: number
}

interface RecentEvent {
  event_type?: string
  timestamp?: string
  actor_id?: number | string
  entity?: string
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

interface BenchResult {
  mode: string
  scenario: string
  throughput_rps: number
  mean_ms: number
  p50_ms: number
  p95_ms: number
  p99_ms: number
  error_rate: number
}

// Embedded benchmark data (from load_tests/results.json — 20 users, 30s)
const BENCH_RESULTS: BenchResult[] = [
  // Scenario A — reads
  { mode: 'B',        scenario: 'A', throughput_rps: 93.67,  mean_ms: 8.4, p50_ms: 5.9, p95_ms: 24.1, p99_ms: 87.3,  error_rate: 0 },
  { mode: 'B+S',      scenario: 'A', throughput_rps: 98.83,  mean_ms: 2.9, p50_ms: 2.1, p95_ms: 5.8,  p99_ms: 14.2,  error_rate: 0 },
  { mode: 'B+S+K',    scenario: 'A', throughput_rps: 98.03,  mean_ms: 3.1, p50_ms: 2.2, p95_ms: 6.3,  p99_ms: 18.7,  error_rate: 0 },
  { mode: 'B+S+K+O',  scenario: 'A', throughput_rps: 99.27,  mean_ms: 2.8, p50_ms: 2.0, p95_ms: 5.5,  p99_ms: 13.1,  error_rate: 0 },
  // Scenario B — writes
  { mode: 'B',        scenario: 'B', throughput_rps: 94.10,  mean_ms: 8.2, p50_ms: 6.1, p95_ms: 16.7, p99_ms: 85.1,  error_rate: 0 },
  { mode: 'B+S',      scenario: 'B', throughput_rps: 93.97,  mean_ms: 8.4, p50_ms: 6.2, p95_ms: 17.1, p99_ms: 82.4,  error_rate: 0 },
  { mode: 'B+S+K',    scenario: 'B', throughput_rps: 93.03,  mean_ms: 9.7, p50_ms: 7.8, p95_ms: 19.4, p99_ms: 91.2,  error_rate: 0 },
  { mode: 'B+S+K+O',  scenario: 'B', throughput_rps: 94.47,  mean_ms: 8.8, p50_ms: 6.9, p95_ms: 17.8, p99_ms: 79.6,  error_rate: 0 },
]

const MODE_COLORS: Record<string, string> = {
  'B':       '#ef4444',
  'B+S':     '#f97316',
  'B+S+K':   '#3b82f6',
  'B+S+K+O': '#10b981',
}

const MODE_LABELS: Record<string, string> = {
  'B':       'Base (MySQL only)',
  'B+S':     'Base + Redis cache',
  'B+S+K':   'Base + Cache + Kafka',
  'B+S+K+O': 'Full stack (optimised)',
}

// ── Small bar component ───────────────────────────────────────────────────────

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%' }}>
      <div style={{
        flex: 1, height: 10, borderRadius: 5,
        background: 'rgba(255,255,255,0.08)',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: color, borderRadius: 5,
          transition: 'width 0.6s ease',
        }} />
      </div>
      <span style={{ fontSize: '0.78rem', color: '#94a3b8', minWidth: 36, textAlign: 'right' }}>
        {value.toFixed(1)}
      </span>
    </div>
  )
}

// ── Live cache probe ──────────────────────────────────────────────────────────

function LiveCacheProbe() {
  const [latencies, setLatencies] = useState<{ cold: number | null; warm: number | null }>({ cold: null, warm: null })
  const [running, setRunning] = useState(false)
  const [cacheHeader, setCacheHeader] = useState<string | null>(null)

  const runProbe = useCallback(async () => {
    setRunning(true)
    setLatencies({ cold: null, warm: null })
    setCacheHeader(null)

    const keyword = 'engineer'
    const payload = { keyword, page: 1, page_size: 10 }

    try {
      // Cold pass — first request may be a miss
      const t0 = performance.now()
      await apiPost('/jobs/search', payload)
      const cold = performance.now() - t0

      // Warm pass — should hit Redis
      const t1 = performance.now()
      await apiPost('/jobs/search', payload)
      const warm = performance.now() - t1

      setLatencies({ cold: Math.round(cold), warm: Math.round(warm) })
      setCacheHeader(`${Math.round(cold)}ms → ${Math.round(warm)}ms  (${(cold / Math.max(warm, 1)).toFixed(1)}× speedup)`)
    } catch {
      setCacheHeader('Backend offline — start with: docker compose up -d')
    } finally {
      setRunning(false)
    }
  }, [])

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12, padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#e2e8f0' }}>
          ⚡ Live Cache Probe — /jobs/search
        </h3>
        <button
          onClick={runProbe}
          disabled={running}
          style={{
            background: running ? 'rgba(59,130,246,0.3)' : '#3b82f6',
            color: '#fff', border: 'none', borderRadius: 8,
            padding: '0.35rem 0.9rem', cursor: running ? 'not-allowed' : 'pointer',
            fontSize: '0.82rem', fontWeight: 600,
          }}
        >
          {running ? 'Measuring…' : 'Run Probe'}
        </button>
      </div>

      <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
        Issues two identical POST /jobs/search requests. First may be a cache miss (MySQL),
        second should be a cache hit (Redis). Shows latency difference live.
      </p>

      {cacheHeader && (
        <div style={{
          background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)',
          borderRadius: 8, padding: '0.6rem 0.9rem', fontSize: '0.88rem', color: '#34d399',
        }}>
          {cacheHeader}
        </div>
      )}

      {latencies.cold !== null && latencies.warm !== null && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          {[
            { label: 'Cold (1st request)', ms: latencies.cold!, color: '#ef4444', icon: '🔴' },
            { label: 'Warm (2nd request)', ms: latencies.warm!, color: '#10b981', icon: '🟢' },
          ].map(({ label, ms, color, icon }) => (
            <div key={label} style={{
              background: 'rgba(255,255,255,0.03)', borderRadius: 8,
              padding: '0.75rem', textAlign: 'center',
            }}>
              <div style={{ fontSize: '1.6rem', fontWeight: 700, color }}>{ms}<span style={{ fontSize: '0.8rem', color: '#64748b' }}>ms</span></div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{icon} {label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function PerformanceDashboard() {
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null)
  const [redisStatus, setRedisStatus] = useState<'online' | 'offline' | 'checking'>('checking')
  const [activeScenario, setActiveScenario] = useState<'A' | 'B'>('A')
  const [activeMetric, setActiveMetric] = useState<'p95_ms' | 'throughput_rps'>('p95_ms')
  const [kafkaStats, setKafkaStats] = useState<KafkaStats | null>(null)
  const [kafkaLoading, setKafkaLoading] = useState(true)

  const fetchStats = useCallback(async () => {
    try {
      const h = await apiGet<HealthWithCache>('/health')
      setCacheStats(h.cache_stats ?? null)
      setRedisStatus(h.redis === 'ok' ? 'online' : 'offline')
    } catch {
      setRedisStatus('offline')
    }
  }, [])

  const fetchKafkaStats = useCallback(async () => {
    try {
      const k = await apiGet<KafkaStats>('/perf/kafka-stats')
      setKafkaStats(k)
    } catch {
      setKafkaStats(null)
    } finally {
      setKafkaLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
    fetchKafkaStats()
    const id1 = setInterval(fetchStats, 5000)
    const id2 = setInterval(fetchKafkaStats, 10000)  // Kafka stats every 10s
    return () => { clearInterval(id1); clearInterval(id2) }
  }, [fetchStats, fetchKafkaStats])

  const scenarioResults = BENCH_RESULTS.filter(r => r.scenario === activeScenario)
  const maxVal = Math.max(...scenarioResults.map(r => r[activeMetric]))

  const aResults = BENCH_RESULTS.filter(r => r.scenario === 'A')
  const bBase = aResults.find(r => r.mode === 'B')
  const bCached = aResults.find(r => r.mode === 'B+S')
  const p95Improvement = bBase && bCached
    ? Math.round(((bBase.p95_ms - bCached.p95_ms) / bBase.p95_ms) * 100)
    : null

  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="panel-title">Performance Dashboard</h2>
        <p className="panel-subtitle">
          Cache hit/miss stats · Benchmark results (B / B+S / B+S+K / B+S+K+O) · Live cache probe
        </p>
      </div>

      {/* ── Top KPI row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {[
          {
            label: 'Redis Status',
            value: redisStatus === 'online' ? 'Online' : redisStatus === 'offline' ? 'Offline' : '…',
            color: redisStatus === 'online' ? '#10b981' : redisStatus === 'offline' ? '#ef4444' : '#64748b',
            icon: '⚡',
            sub: 'Cache layer',
          },
          {
            label: 'Cache Hits',
            value: cacheStats ? cacheStats.hits.toLocaleString() : '—',
            color: '#10b981',
            icon: '✓',
            sub: 'Since last restart',
          },
          {
            label: 'Cache Misses',
            value: cacheStats ? cacheStats.misses.toLocaleString() : '—',
            color: '#f97316',
            icon: '✗',
            sub: 'Since last restart',
          },
          {
            label: 'Hit Rate',
            value: cacheStats ? `${cacheStats.hit_rate_pct}%` : '—',
            color: cacheStats && cacheStats.hit_rate_pct >= 70 ? '#10b981' : '#f97316',
            icon: '📊',
            sub: 'hits / total',
          },
          {
            label: 'P95 Improvement',
            value: p95Improvement !== null ? `${p95Improvement}%` : '—',
            color: '#3b82f6',
            icon: '↓',
            sub: 'B → B+S (reads)',
          },
        ].map(({ label, value, color, icon, sub }) => (
          <div key={label} style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem',
          }}>
            <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
            <span style={{ fontSize: '1.5rem', fontWeight: 700, color }}>{icon} {value}</span>
            <span style={{ fontSize: '0.72rem', color: '#475569' }}>{sub}</span>
          </div>
        ))}
      </div>

      {/* ── Live probe ── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <LiveCacheProbe />
      </div>

      {/* ── Benchmark bar charts ── */}
      <div style={{
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12, padding: '1.25rem', marginBottom: '1.5rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#e2e8f0' }}>
            📊 Benchmark — B / B+S / B+S+K / B+S+K+O
          </h3>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {(['A', 'B'] as const).map(s => (
              <button key={s}
                onClick={() => setActiveScenario(s)}
                style={{
                  padding: '0.25rem 0.7rem', borderRadius: 6, fontSize: '0.78rem',
                  border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', fontWeight: 600,
                  background: activeScenario === s ? '#3b82f6' : 'transparent',
                  color: activeScenario === s ? '#fff' : '#94a3b8',
                }}
              >
                Scenario {s} {s === 'A' ? '(Reads)' : '(Writes)'}
              </button>
            ))}
            {(['p95_ms', 'throughput_rps'] as const).map(m => (
              <button key={m}
                onClick={() => setActiveMetric(m)}
                style={{
                  padding: '0.25rem 0.7rem', borderRadius: 6, fontSize: '0.78rem',
                  border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', fontWeight: 600,
                  background: activeMetric === m ? '#8b5cf6' : 'transparent',
                  color: activeMetric === m ? '#fff' : '#94a3b8',
                }}
              >
                {m === 'p95_ms' ? 'P95 Latency (ms)' : 'Throughput (req/s)'}
              </button>
            ))}
          </div>
        </div>

        <p style={{ margin: '0 0 1rem', fontSize: '0.78rem', color: '#475569' }}>
          {activeScenario === 'A'
            ? 'Scenario A: Job search + detail view (read-heavy). 20 concurrent users, 30s run. Redis pre-warmed in B+S modes.'
            : 'Scenario B: Application submit (DB write + Kafka event). 20 concurrent users, 30s run. JWT auth via perf-test account.'}
          {' '}Source: load_tests/results.json
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {scenarioResults.map(r => (
            <div key={r.mode} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span style={{ color: MODE_COLORS[r.mode] || '#94a3b8', fontWeight: 600 }}>{r.mode}</span>
                <span style={{ color: '#64748b', fontSize: '0.72rem' }}>{MODE_LABELS[r.mode]}</span>
              </div>
              <Bar value={r[activeMetric]} max={maxVal} color={MODE_COLORS[r.mode] || '#64748b'} />
            </div>
          ))}
        </div>

        {activeScenario === 'A' && activeMetric === 'p95_ms' && p95Improvement !== null && (
          <div style={{
            marginTop: '1rem', padding: '0.6rem 0.9rem', borderRadius: 8,
            background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)',
            fontSize: '0.82rem', color: '#34d399',
          }}>
            ✓ Redis cache reduces P95 latency by <strong>{p95Improvement}%</strong> on read-heavy traffic
            (B: {bBase?.p95_ms}ms → B+S: {bCached?.p95_ms}ms)
          </div>
        )}
      </div>

      {/* ── Live Kafka Event Stats (from AWS MongoDB) ── */}
      <div style={{
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12, padding: '1.25rem', marginBottom: '1.5rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#e2e8f0' }}>
            🔄 Live Kafka Event Pipeline — AWS MongoDB
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {kafkaStats?.status === 'error' && (
              <span style={{ fontSize: '0.72rem', color: '#ef4444' }}>⚠ {kafkaStats.error}</span>
            )}
            <button
              onClick={fetchKafkaStats}
              style={{
                background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
                color: '#94a3b8', borderRadius: 6, padding: '0.2rem 0.6rem',
                cursor: 'pointer', fontSize: '0.75rem',
              }}
            >↻ Refresh</button>
          </div>
        </div>

        {kafkaLoading ? (
          <p style={{ color: '#475569', fontSize: '0.82rem' }}>Loading live data from MongoDB…</p>
        ) : kafkaStats?.status === 'ok' ? (
          <>
            {/* KPI grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.6rem', marginBottom: '1rem' }}>
              {[
                { label: 'Events Logged',    value: kafkaStats.totals.events_logged.toLocaleString(),            color: '#3b82f6', icon: '📨' },
                { label: 'Unique Processed', value: kafkaStats.totals.events_processed_unique.toLocaleString(),  color: '#10b981', icon: '✓' },
                { label: 'Dead Letters',     value: kafkaStats.totals.dead_letters.toLocaleString(),             color: kafkaStats.totals.dead_letters > 0 ? '#ef4444' : '#64748b', icon: '💀' },
                { label: 'Last 24 h',        value: kafkaStats.totals.events_last_24h.toLocaleString(),          color: '#f97316', icon: '🕐' },
                { label: 'Job Clicks',       value: kafkaStats.totals.job_clicks_aggregated.toLocaleString(),    color: '#8b5cf6', icon: '👆' },
                { label: 'Job Saves',        value: kafkaStats.totals.job_saves_aggregated.toLocaleString(),     color: '#ec4899', icon: '🔖' },
              ].map(({ label, value, color, icon }) => (
                <div key={label} style={{
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 8, padding: '0.65rem 0.75rem',
                }}>
                  <div style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>{label}</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color }}>{icon} {value}</div>
                </div>
              ))}
            </div>

            {/* Events by type */}
            {kafkaStats.events_by_type.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#475569', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Events by Type</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {kafkaStats.events_by_type.map(({ event_type, count }) => {
                    const maxCount = kafkaStats.events_by_type[0]?.count || 1
                    const pct = Math.round((count / maxCount) * 100)
                    return (
                      <div key={event_type} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem' }}>
                        <span style={{ color: '#94a3b8', minWidth: 180 }}>{event_type}</span>
                        <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: '#3b82f6', borderRadius: 4, transition: 'width 0.5s' }} />
                        </div>
                        <span style={{ color: '#64748b', minWidth: 40, textAlign: 'right' }}>{count.toLocaleString()}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Recent events feed — live from AWS MongoDB */}
            {kafkaStats.recent_events.length > 0 && (
              <div>
                <div style={{ fontSize: '0.75rem', color: '#475569', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Recent Events — live from MongoDB (auto-refreshes every 10s)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {kafkaStats.recent_events.map((ev, i) => (
                    <div key={i} style={{
                      background: 'rgba(255,255,255,0.02)', borderRadius: 6, padding: '0.4rem 0.6rem',
                      display: 'flex', gap: '0.75rem', alignItems: 'baseline', flexWrap: 'wrap', fontSize: '0.75rem',
                    }}>
                      <span style={{ color: '#3b82f6', fontWeight: 600, minWidth: 160 }}>{ev.event_type ?? 'unknown'}</span>
                      {ev.actor_id != null && <span style={{ color: '#64748b' }}>actor={ev.actor_id}</span>}
                      {ev.entity && <span style={{ color: '#64748b' }}>entity={ev.entity}</span>}
                      {ev.trace_id && <span style={{ color: '#374151', fontFamily: 'monospace', fontSize: '0.7rem' }}>{String(ev.trace_id).slice(0, 12)}…</span>}
                      {ev.timestamp && <span style={{ color: '#374151', marginLeft: 'auto' }}>{new Date(ev.timestamp).toLocaleTimeString()}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <p style={{ color: '#475569', fontSize: '0.82rem' }}>
            ⚠ Could not reach /perf/kafka-stats — ensure the backend is running and MongoDB is reachable.
          </p>
        )}
      </div>

      {/* ── Results table ── */}
      <div style={{
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12, padding: '1.25rem', marginBottom: '1.5rem', overflowX: 'auto',
      }}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '0.95rem', fontWeight: 600, color: '#e2e8f0' }}>
          Full Results Table — 20 users · 30s · 0% error rate
        </h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              {['Mode', 'Scenario', 'RPS', 'Mean', 'P50', 'P95', 'P99', 'Errors'].map(h => (
                <th key={h} style={{ padding: '0.4rem 0.6rem', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {BENCH_RESULTS.map((r, i) => (
              <tr key={i} style={{
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
              }}>
                <td style={{ padding: '0.4rem 0.6rem', color: MODE_COLORS[r.mode] || '#e2e8f0', fontWeight: 700 }}>{r.mode}</td>
                <td style={{ padding: '0.4rem 0.6rem', color: r.scenario === 'A' ? '#3b82f6' : '#f97316' }}>
                  {r.scenario === 'A' ? 'A (Read)' : 'B (Write)'}
                </td>
                <td style={{ padding: '0.4rem 0.6rem', color: '#e2e8f0' }}>{r.throughput_rps}</td>
                <td style={{ padding: '0.4rem 0.6rem', color: '#94a3b8' }}>{r.mean_ms}ms</td>
                <td style={{ padding: '0.4rem 0.6rem', color: '#94a3b8' }}>{r.p50_ms}ms</td>
                <td style={{ padding: '0.4rem 0.6rem', color: r.p95_ms > 20 ? '#f97316' : '#10b981' }}>{r.p95_ms}ms</td>
                <td style={{ padding: '0.4rem 0.6rem', color: '#94a3b8' }}>{r.p99_ms}ms</td>
                <td style={{ padding: '0.4rem 0.6rem', color: r.error_rate === 0 ? '#10b981' : '#ef4444' }}>{r.error_rate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── How to re-run ── */}
      <div style={{
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 12, padding: '1.25rem',
      }}>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', fontWeight: 600, color: '#94a3b8' }}>
          🔧 Reproduce These Results
        </h3>
        <pre style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', lineHeight: 1.8, overflowX: 'auto' }}>
{`# 1. Start services
docker compose up -d

# 2. Seed 10k dataset + perf-test account
cd backend && python seed_data.py --yes

# 3. Run the benchmark harness
cd load_tests
python perf_comparison.py --users 20 --duration 30 --json > results.json

# 4. Run the cache benchmark
cd backend
python cache_benchmark.py --member-id 1 --repeats 10

# 5. Run Locust (interactive)
cd load_tests
locust -f locustfile.py --host http://localhost:8000`}
        </pre>
      </div>
    </section>
  )
}
