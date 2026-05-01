# Kafka — Performance & Analytics Alignment

## Why Activity-Center Work Was Not the Right Focus

The prior Kafka work introduced a social notification/bell-feed feature:
- Consumer handlers wrote to a `notifications` MongoDB collection for connection and application events.
- The `/notifications/list` endpoint fetched from that collection and merged results into a social activity feed.

This is a generic social feature, not a performance or analytics deliverable. The project scope for this contribution is:

> **Kafka · performance · scaling · seed data · load tests · performance charts · transaction consistency · observability/reporting**

A social bell-feed has no bearing on any of those areas. It was removed.

---

## How Kafka Is Now Used

All Kafka consumer handlers either drive **pre-aggregated analytics counters** in MongoDB or atomically update **MySQL performance counters**. None write to a social notification collection.

### Event → Analytics mapping

| Kafka Event | Consumer Side-Effect | Analytics Output |
|---|---|---|
| `job.viewed` | Atomic `views_count++` in MySQL + upsert `analytics_job_clicks_daily` | Clicks-per-job chart (`/analytics/jobs/clicks`) |
| `job.saved` | Upsert `analytics_saves_daily` | Saves trend chart (`/analytics/saves/trend`) |
| `profile.viewed` | Atomic `profile_view_daily++` in MySQL | Member profile-view dashboard (`/analytics/member/dashboard`) |
| `application.submitted` | Upsert `analytics_applications_daily` + `event_logs` | Applications-per-day aggregate, surfaced in `/perf/kafka-stats` |
| `connection.requested` | Upsert `analytics_connections_daily.requested` + `event_logs` | Daily connection request counts, surfaced in `/perf/kafka-stats` |
| `connection.accepted` | Upsert `analytics_connections_daily.accepted` + `event_logs` | Daily connection accept counts, surfaced in `/perf/kafka-stats` |
| `message.sent` | `event_logs` only | Event log / observability |

### Pre-aggregated collections

| Collection | Purpose | Updated by |
|---|---|---|
| `analytics_job_clicks_daily` | Job view counts per day | `job.viewed` handler |
| `analytics_saves_daily` | Saved-job counts per day | `job.saved` handler |
| `analytics_applications_daily` | Application submissions per day | `application.submitted` handler |
| `analytics_connections_daily` | Connection requests/accepts per day | `connection.requested` / `connection.accepted` handlers |
| `event_logs` | Raw event log for all events | Every handler |
| `processed_events` | Idempotency records | Consumer loop |
| `dead_letters` | Poison-pill events | Consumer loop |

### Daily time-series endpoint

`GET /perf/event-trend?days=14` merges all four analytics collections by date and returns a unified time-series:

```json
{
  "status": "ok",
  "days": 14,
  "series": [
    { "date": "2026-04-14", "job_clicks": 12, "job_saves": 5, "applications": 8, "conn_requested": 3, "conn_accepted": 2 },
    ...
  ]
}
```

This powers the **Kafka Event Trend** chart in the Performance Dashboard.

### Observability / pipeline health

The `/perf/kafka-stats` endpoint exposes:
- Total events logged, unique processed, dead letters, last-24h activity
- Events broken down by type (bar chart in Performance Dashboard)
- Last 8 events (live activity feed in Performance Dashboard)
- Pre-aggregated totals: job clicks, job saves, applications, connections requested, connections accepted

All of these are visible in the **Performance Dashboard** (`/performance` tab in the frontend).

---

## What Kafka Powers for Charts / Demo Evidence

| Metric | Data source | Where visible |
|---|---|---|
| Clicks per job posting | `analytics_job_clicks_daily` | `/analytics/jobs/clicks` + analytics page |
| Saved-jobs trend (daily/weekly) | `analytics_saves_daily` | `/analytics/saves/trend` + saves chart |
| Job application funnel | MySQL + `views_count` (Kafka-driven) | `/analytics/funnel` |
| **Daily event trend (all types)** | all four analytics collections | `/perf/event-trend` → **Kafka Event Trend chart** in Performance tab |
| Applications per day | `analytics_applications_daily` | `/perf/kafka-stats` totals + trend chart |
| Connection activity per day | `analytics_connections_daily` | `/perf/kafka-stats` totals + trend chart |
| Pipeline health (idempotency, dedup, dead-letter) | `processed_events`, `dead_letters` | `/perf/kafka-stats` |
| Live event stream | `event_logs` | Performance Dashboard — Live Activity Feed |
| Benchmark comparison | Static results in `PerformanceDashboard.tsx` | Performance Dashboard — Benchmark section |

---

## Files Changed

| File | Change |
|---|---|
| `backend/kafka_consumer.py` | `handle_application_submitted`: replaced notification write with `analytics_applications_daily` upsert. `handle_connection_requested` / `handle_connection_accepted`: replaced notification writes with `analytics_connections_daily` upserts. |
| `backend/routers/notifications.py` | Removed MongoDB notifications fetch (section 4). Reverted to MySQL-only synchronous queries. |
| `backend/database.py` | Replaced `notifications` collection indexes with indexes for `analytics_applications_daily` and `analytics_connections_daily`. |
| `backend/routers/perf_router.py` | Added `applications_aggregated`, `connections_requested_aggregated`, `connections_accepted_aggregated` to `/perf/kafka-stats`. Added `GET /perf/event-trend?days=N` returning merged daily time-series. Added `GET /perf/bench-results` serving `backend/load_tests/results.json` with run metadata and analysis block. |
| `backend/seed_data.py` | Added `seed_mongo_analytics()` — populates all 4 analytics MongoDB collections from SQL at seed time so the Performance Dashboard has non-zero data without waiting for Kafka events. |
| `backend/load_tests/results.json` | Created — copy of `load_tests/results.json` placed inside the Docker build context so `/perf/bench-results` can serve it from within the container. |
| `frontend/src/components/PerformanceDashboard.tsx` | Added 9 Kafka KPI tiles. Added **Kafka Event Trend** daily bar chart (7d/14d toggle). Added live bench-results loading with run metadata and analysis callouts. Added `n` (total_requests) column to Full Results table. |
| `KAFKA_ACTIVITY_CENTER_REVIEW.md` | Deleted (described the misaligned approach). |
| `KAFKA_PERFORMANCE_ALIGNMENT.md` | Created (this file). |
| `FINAL_SCOPE_VALIDATION.md` | Created — end-to-end validation report with tested endpoint outputs and limitations. |

---

## Demo Steps

### Show the Kafka analytics pipeline

```bash
# 1. Start services
docker compose up -d

# 2. Seed data (generates events)
cd backend && python seed_data.py --yes

# 3. Check what Kafka has aggregated (should show non-zero totals)
curl http://localhost:8000/perf/kafka-stats | python -m json.tool

# 4. Open the Performance Dashboard in the browser
#    http://localhost:3000 → Performance tab
#    Kafka Event Pipeline section shows all totals and event breakdown
```

### Show Kafka Event Trend chart in the Performance tab

1. Open `http://localhost:3000` → click **Performance** tab
2. Scroll to **"Kafka Event Trend — Daily Analytics"** card
3. Observe daily bars for job_clicks, job_saves, applications, conn_requested, conn_accepted
4. Toggle between **7d** and **14d** windows
5. Each bar represents one day of Kafka-consumer-processed events; data comes from `/perf/event-trend`

Or verify the endpoint directly:
```bash
curl "http://localhost:8000/perf/event-trend?days=14" | python -m json.tool
```

### Show job-click analytics (Kafka-driven pre-aggregation)

```bash
# View a job (triggers job.viewed → consumer → analytics_job_clicks_daily)
curl -s -X POST http://localhost:8000/jobs/view \
  -H "Content-Type: application/json" -d '{"job_id": 1, "member_id": 1}'

# Query the pre-aggregated clicks
curl -s -X POST http://localhost:8000/analytics/jobs/clicks \
  -H "Content-Type: application/json" -d '{"window_days": 30, "limit": 10}' | python -m json.tool
```

### Show saves trend (Kafka-driven)

```bash
curl -s -X POST http://localhost:8000/analytics/saves/trend \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <member_token>" \
  -d '{"window_days": 30, "granularity": "day"}' | python -m json.tool
```

### Show application funnel

```bash
curl -s -X POST http://localhost:8000/analytics/funnel \
  -H "Content-Type: application/json" -d '{"job_id": 1}' | python -m json.tool
```

### Verify MongoDB analytics collections directly

```bash
docker exec linkedin-mongodb mongosh \
  "mongodb://teammongo:ChangeThisMongoUserPass123!@localhost:27017/team_mongo_db?authSource=team_mongo_db" \
  --eval "
    print('--- analytics_job_clicks_daily ---');
    db.analytics_job_clicks_daily.find().sort({date:-1}).limit(5).pretty();
    print('--- analytics_saves_daily ---');
    db.analytics_saves_daily.find().sort({date:-1}).limit(5).pretty();
    print('--- analytics_applications_daily ---');
    db.analytics_applications_daily.find().sort({date:-1}).limit(5).pretty();
    print('--- analytics_connections_daily ---');
    db.analytics_connections_daily.find().sort({date:-1}).limit(5).pretty();
  "
```

---

## Limitations

1. `analytics_applications_daily` and `analytics_connections_daily` start accumulating from when Kafka events first flow through the new handlers. Historical events (before this change) are not backfilled — but the `/analytics` endpoints fall back to MySQL queries when the aggregated collections are empty, so charts never return empty.

2. The `/notifications/list` endpoint still exists and serves MySQL-backed data (pending connection requests, post likes, friend posts). This is fine — it predates the misaligned work and is unrelated to Kafka.

3. The pre-aggregated counters do not distinguish per-user or per-recruiter — they are system-wide daily totals. For per-job click breakdown, use `/analytics/jobs/clicks`.

4. Dead-letter replay is not automated — a dead-lettered event requires manual inspection and re-publish if the downstream issue is resolved.
