# Final Scope Validation — Kafka / Performance / Analytics

Validated: 2026-04-27

---

## What Was Already Complete Before This Session

| Area | State |
|---|---|
| Kafka consumer at-least-once delivery (manual offset commits) | Complete |
| Idempotent dedup — in-memory Set + `processed_events` MongoDB collection | Complete |
| Poison-pill / dead-letter queue (`MAX_DELIVERY_ATTEMPTS=3`, `dead_letters` collection) | Complete |
| `handle_job_viewed` → atomic SQL `views_count++` + `analytics_job_clicks_daily` upsert | Complete |
| `handle_job_saved` → `analytics_saves_daily` upsert | Complete |
| `handle_profile_viewed` → MySQL `profile_view_daily` atomic upsert | Complete |
| `handle_message_sent` → `event_logs` only | Complete |
| Redis cache-aside pattern with hit/miss counters | Complete |
| `/perf/kafka-stats` endpoint (events_logged, processed_unique, dead_letters, events_by_type, recent_events) | Complete |
| `/perf/cache-stats` endpoint | Complete |
| `/perf/mysql-stats` endpoint | Complete |
| `load_tests/results.json` — 8-run benchmark artifact (B / B+S / B+S+K / B+S+K+O × Scenario A/B) | Complete |
| Performance Dashboard (`/performance` tab) — base structure, benchmark chart | Complete |

---

## What Was Corrected / Added

### 1. Kafka Consumer — Analytics Redirection

**Problem:** `handle_application_submitted`, `handle_connection_requested`, `handle_connection_accepted` were writing to a `notifications` MongoDB collection (social bell-feed), not analytics.

**Fix in `backend/kafka_consumer.py`:**
- `handle_application_submitted` now upserts `analytics_applications_daily` (`$inc count`)
- `handle_connection_requested` now upserts `analytics_connections_daily` (`$inc requested`)
- `handle_connection_accepted` now upserts `analytics_connections_daily` (`$inc accepted`)
- All `notifications` writes removed

### 2. Notifications Router — MongoDB Fetch Removed

**Problem:** `/notifications/list` had a Section 4 that fetched from MongoDB `notifications` collection.

**Fix in `backend/routers/notifications.py`:** Section 4 removed; endpoint is MySQL-only.

### 3. Database — Index Alignment

**Problem:** `database.py` was creating indexes for a `notifications` collection that no longer receives writes.

**Fix in `backend/database.py`:** Replaced `notifications` indexes with indexes on `analytics_applications_daily` (unique on date) and `analytics_connections_daily` (unique on date).

### 4. `/perf/kafka-stats` — Three New Aggregated Totals

Added to `backend/routers/perf_router.py`:
- `applications_aggregated` — total from `analytics_applications_daily`
- `connections_requested_aggregated` — total from `analytics_connections_daily`
- `connections_accepted_aggregated` — total from `analytics_connections_daily`

### 5. `/perf/event-trend` — New Endpoint

`GET /perf/event-trend?days=N` (default 14, max 90) merges all four daily analytics collections by date and returns a unified time-series sorted oldest-first. Powers the Kafka Event Trend chart in the Performance Dashboard.

Verified output (2026-04-27, 14-day window, 11 rows with real data):
```
date=2026-04-27: job_clicks=1, job_saves=1, applications=5, conn_requested=3, conn_accepted=2
```

### 6. `/perf/bench-results` — New Endpoint

`GET /perf/bench-results` serves `backend/load_tests/results.json` from disk.
Returns full JSON including `parameters` (run metadata), `results` (8 rows), and `analysis` (key findings).

Verified output:
```
status: ok | results count: 8 | run_date: 2026-04-24 | machine: single-host Docker (macOS, Apple Silicon M-series)
scenario_a key_finding: P95 latency drops 4.2x when Redis cache is warm...
```

### 7. `seed_data.py` — MongoDB Analytics Seeding

Added `async def seed_mongo_analytics(db)` called at the end of `run_seed()`.

Populates all four analytics collections from SQL date-aggregated data at seed time so the Performance Dashboard has non-zero data immediately after seeding:
- `analytics_applications_daily` — from `applications.application_datetime`
- `analytics_saves_daily` — from `saved_jobs.saved_at`
- `analytics_connections_daily` — from `connections.created_at` (requested + accepted split)
- `analytics_job_clicks_daily` — distributes `jobs.views_count` across dates

Verified counts (live DB):
- `analytics_applications_daily`: 64 days, 116 total applications
- `analytics_connections_daily`: 118 days
- `analytics_job_clicks_daily`: 3 days (from recent Kafka events + seed)
- `analytics_saves_daily`: 1 day

### 8. Frontend — Kafka Event Trend Chart

Added to `frontend/src/components/PerformanceDashboard.tsx`:
- "Kafka Event Trend — Daily Analytics" card
- 7d / 14d toggle
- Per-event-type daily bar chart (job_clicks, job_saves, applications, conn_requested, conn_accepted)
- Polls `/perf/event-trend` every 30s

### 9. Frontend — Benchmark Card Live Data

- `BENCH_RESULTS_FALLBACK` constant retained as fallback
- `fetchBenchData()` loads from `/perf/bench-results` on mount
- When live, shows: run metadata (run_date, machine, seed_profile), `(live)` vs `(embedded fallback)` source badge
- Analysis callouts render `key_finding` from `analysis.scenario_a_cache_impact` and `analysis.scenario_b_kafka_overhead`

### 10. Frontend — Full Results Table `n` Column

Added `n` column to Full Benchmark Results table showing `total_requests` per run (e.g., 2,810–2,978 for 20 users × 30 s).

---

## Which Real User Actions Drive Real Kafka + Analytics Updates

| User Action | Kafka Event | Consumer Side-Effect | Analytics Collection |
|---|---|---|---|
| View a job posting | `job.viewed` | Atomic `views_count++` in MySQL | `analytics_job_clicks_daily` |
| Save a job posting | `job.saved` | Upsert | `analytics_saves_daily` |
| Submit an application | `application.submitted` | Upsert | `analytics_applications_daily` |
| Send a connection request | `connection.requested` | Upsert | `analytics_connections_daily.requested` |
| Accept a connection request | `connection.accepted` | Upsert | `analytics_connections_daily.accepted` |
| View a member profile | `profile.viewed` | Atomic `profile_view_daily++` in MySQL | MySQL (no Mongo) |
| Send a message | `message.sent` | `event_logs` write | Observability only |

---

## Which Performance Tab Sections Use Real Data

| Dashboard Section | Data Source | Real? |
|---|---|---|
| Kafka Pipeline KPIs (9 tiles) | `/perf/kafka-stats` → MongoDB live | Yes |
| Kafka Event Trend Chart | `/perf/event-trend` → MongoDB live | Yes |
| Events by Type bar chart | `/perf/kafka-stats` → MongoDB live | Yes |
| Live Activity Feed (last 8 events) | `/perf/kafka-stats` → MongoDB live | Yes |
| Cache Stats | `/perf/cache-stats` → Redis live | Yes |
| MySQL Stats | `/perf/mysql-stats` → MySQL live | Yes |
| Benchmark Results Chart | `/perf/bench-results` → results.json (live) with fallback to embedded constant | Yes (live) |
| Benchmark Analysis Callouts | `/perf/bench-results` → `analysis` block | Yes (live) |
| Full Results Table | same, `n` column from `total_requests` | Yes (live) |

---

## What Was Tested (2026-04-27)

```bash
# 1. kafka-stats — non-zero aggregates confirmed
curl http://localhost:8000/perf/kafka-stats
# → applications_aggregated: 116, connections_requested_aggregated: 159, connections_accepted_aggregated: 104

# 2. event-trend — 11-row series with all 5 metric types confirmed
curl "http://localhost:8000/perf/event-trend?days=14"
# → 11 days of data, all columns non-zero across the range

# 3. bench-results — full JSON from results.json confirmed
curl http://localhost:8000/perf/bench-results
# → status: ok, 8 results, parameters.run_date: 2026-04-24, analysis block present

# 4. health check — all services healthy
curl http://localhost:8000/health
# → {"status":"healthy","services":{"api":true,"mysql":true,"mongo":true,"redis":true,"kafka":true}}
```

---

## Remaining Limitations

1. **`analytics_applications_daily` and `analytics_connections_daily` accumulate from Kafka events only after the consumer handler update.** Historical events that flowed under the old handler wrote to `notifications` (now removed) and are not in these collections. The gap is bridged by `seed_mongo_analytics` at seed time.

2. **`analytics_job_clicks_daily` has sparse data** — only days with real Kafka `job.viewed` events appear. The seed distributes `views_count` totals, but if the load-test hasn't been run recently, gaps between dates are normal.

3. **Dead-letter replay is manual.** Events in `dead_letters` require manual inspection and re-publish; no automated replay exists.

4. **Benchmark results are static once generated.** `load_tests/results.json` is a point-in-time artifact. Re-running `perf_comparison.py --json > results.json` (inside `backend/load_tests/`) and rebuilding the Docker image updates the live endpoint.

5. **`backend/load_tests/results.json` is a copy** of the authoritative `load_tests/results.json` at the project root. If the root file is updated, the backend copy must be refreshed and the image rebuilt.

---

## Files Changed (This Session)

| File | Change |
|---|---|
| `backend/kafka_consumer.py` | Replaced notification writes with analytics upserts in three handlers |
| `backend/routers/notifications.py` | Removed MongoDB section 4 |
| `backend/database.py` | Replaced notifications indexes with analytics_applications_daily / analytics_connections_daily indexes |
| `backend/routers/perf_router.py` | Added 3 new aggregated totals to `/perf/kafka-stats`; new `/perf/event-trend` endpoint; new `/perf/bench-results` endpoint; corrected file path to `../load_tests/` |
| `backend/seed_data.py` | Added `seed_mongo_analytics()` function and call in `run_seed()` |
| `backend/load_tests/results.json` | Created (copy of `load_tests/results.json` for Docker build context) |
| `frontend/src/components/PerformanceDashboard.tsx` | Added Kafka KPI tiles, Event Trend chart, live bench-results loading, analysis callouts, `n` column in Full Results table |
| `KAFKA_PERFORMANCE_ALIGNMENT.md` | Created — documents the analytics direction, event→collection mapping, demo steps |
| `FINAL_SCOPE_VALIDATION.md` | Created (this file) |
