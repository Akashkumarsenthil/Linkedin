# Kafka Architecture Gap Report

**LinkedIn Agentic AI Platform — DATA236**
Audit date: 2026-05-03

---

## 1. What Is Already Implemented (Well)

### Event envelope
Every published Kafka message uses a consistent, standardised envelope defined in `kafka_producer.py`:

```json
{
  "event_type":      "application.submitted",
  "trace_id":        "uuid",
  "timestamp":       "2026-05-03T10:00:00Z",
  "actor_id":        "42",
  "entity":          { "entity_type": "application", "entity_id": "123" },
  "payload":         { "job_id": 1, "member_id": 42 },
  "idempotency_key": "app_submit:42:1"
}
```

All publishers go through the single `KafkaEventProducer.publish()` helper — there is no ad-hoc event building scattered across files.

### Offset commit
The consumer (`kafka_consumer.py`) runs with `enable_auto_commit=False`. Offsets are committed **manually and only after**:
1. Handler executes successfully, AND
2. Idempotency record is written to MongoDB

If a handler raises an exception, the offset is intentionally left uncommitted so Kafka redelivers the message on the next consumer restart.

### Idempotency
Two-layer deduplication prevents duplicate side-effects under Kafka's at-least-once delivery:
1. **In-memory set** (`processed_keys`) — fast path, per-process lifetime
2. **MongoDB `processed_events`** — durable across restarts, unique index on `idempotency_key`

### Dead-letter / poison-pill protection
After `MAX_DELIVERY_ATTEMPTS = 3` failures for the same message, the consumer writes the full event to `dead_letters` (MongoDB) and commits the offset to unblock the partition. Failed events are never silently dropped.

### Consumer retry / startup resilience
Both `main_analytics.py` and `main_ai.py` wrap consumer startup in an exponential-backoff retry loop (3 s → 6 s → … → 60 s cap). The consumer reconnects automatically after broker restarts.

### Pre-aggregated analytics
The consumer maintains lightweight MongoDB daily aggregation documents instead of forcing analytics endpoints to scan raw `event_logs`. Collections maintained:
- `analytics_job_clicks_daily` (via `job.viewed`)
- `analytics_saves_daily` (via `job.saved`)
- `analytics_applications_daily` (via `application.submitted`)
- `analytics_connections_daily` (via `connection.requested` / `connection.accepted`)

### AI workflow coordination via Kafka
`POST /ai/analyze-candidates` → publishes `ai.requested` to `ai.requests` topic → consumer handler enqueues the task into the async dispatcher. The HTTP endpoint returns immediately; heavy work runs in background.

### Kafka dual-write fallback
`routers/jobs.py` and `routers/applications.py` have a `_log_failed_kafka_event()` helper that writes failed publish attempts to `failed_kafka_events` (MySQL) so no event is silently lost if the broker is temporarily unavailable.

### Docker / local dev listener config
| Environment | Bootstrap server | Listener |
|-------------|-----------------|---------|
| Docker Compose (container → container) | `kafka:9092` | `PLAINTEXT` |
| Local dev (outside Docker) | `localhost:9094` | `EXTERNAL` |

Both env files (`/.env` and `/backend/.env`) set `KAFKA_BOOTSTRAP_SERVERS=localhost:9094` for local dev. The `docker-compose.yml` `x-backend-common` anchor overrides this to `kafka:9092` for containerised services. Config is correct and consistent.

---

## 2. Gaps Identified

### Gap 1 — Missing consumer handlers for published topics

Three topics are published by services but have **no dedicated consumer handler**. They fall through to the generic no-op branch (which only logs to MongoDB with no structured side effect):

| Topic | Published by | Handler registered? | Side effect missing |
|-------|-------------|--------------------|--------------------|
| `application.statusChanged` | `POST /applications/updateStatus` | ❌ No | Structured MongoDB log |
| `job.created` | `POST /jobs/create` | ❌ No | Structured MongoDB log |
| `job.closed` | `POST /jobs/close` | ❌ No | Structured MongoDB log |
| `ai.results` | Hiring assistant workflow steps | ❌ No | Structured MongoDB log |

These are not missing analytics — the generic handler already writes them to `event_logs`. The gap is that there is **no explicit handler**, making the consumer code harder to read and intent harder to verify.

### Gap 2 — Kafka publish failure fallback is inconsistent

The `_log_failed_kafka_event()` dual-write fallback exists in `jobs.py` and `applications.py` but is **absent from three routers**:

| Router | Kafka events published | Fallback present? |
|--------|----------------------|------------------|
| `routers/connections.py` | `connection.requested`, `connection.accepted` | ❌ No — `except` only logs a warning |
| `routers/messages.py` | `message.sent` | ❌ No — `except` only logs a warning |
| `routers/members.py` | `profile.viewed` | ❌ No — `except: pass` (silent) |

If Kafka is temporarily unavailable, events from these routers are silently lost.

### Gap 3 — README Kafka table is inaccurate

The README states:

> `application.submitted` → "Increments `applicants_count` in MySQL"

This is **wrong**. `applicants_count` is incremented in the HTTP handler (`routers/applications.py`) at commit time. The consumer handler (`handle_application_submitted`) **explicitly skips** the increment to avoid double-counting. The consumer only logs to MongoDB and upserts the analytics aggregate.

### Gap 4 — Architecture described as "true microservices" — it is a modular monolith

Both the README and previous architecture docs describe the system as a "distributed microservices architecture." In practice:

- All seven services share the same Python codebase, models, `database.py`, `kafka_producer.py`, and `kafka_consumer.py`
- All services read/write the same MySQL and MongoDB databases directly via SQLAlchemy and Motor
- There is no service-to-service API contract — services share code and DB connections
- The only isolation is the entry point (`main_profile.py`, `main_job.py`, etc.) and the Docker container boundary

This is a **modular monolith deployed as containerised processes** — a legitimate and practical architecture, but it should be described honestly. True microservices would have separate databases, separate codebases, and communicate only via APIs or events.

### Gap 5 — `profile.viewed` publish failure is silently swallowed

In `routers/members.py`, the Kafka publish for `profile.viewed` uses `except: pass`:

```python
try:
    await kafka_producer.publish(topic="profile.viewed", ...)
except Exception:
    pass   # ← silent drop
```

This is inconsistent with other routers and means profile view events can be silently lost, causing missing analytics and missing notifications.

---

## 3. Desired Architecture (Confirmed Correct)

```
Browser
  │  HTTP / WebSocket only
  ▼
API Gateway (Nginx)
  │  routes by URL prefix
  ▼
Microservice / FastAPI handler
  │  synchronous: reads/writes MySQL, Redis
  │  synchronous: returns HTTP response
  │
  └──► Kafka (PUBLISH — fire and forget, non-blocking)
            │  async
            ▼
       Kafka Consumer (analytics-service / ai-service)
            │  idempotent processing
            ├──► MongoDB (event logs, aggregates, AI state)
            └──► MySQL (counter increments, view tracking)
```

**What must never happen:**
- Browser publishing directly to Kafka
- Kafka replacing the HTTP request/response layer
- Frontend being aware Kafka exists

---

## 4. Changes Implemented

### kafka_consumer.py
- Added `handle_application_status_changed()` — logs `application.statusChanged` to MongoDB
- Added `handle_job_created()` — logs `job.created` to MongoDB
- Added `handle_job_closed()` — logs `job.closed` to MongoDB
- Added `handle_ai_result()` — logs `ai.results` to MongoDB
- Registered all four new handlers

### routers/connections.py
- Added `_log_failed_kafka_event()` helper and `FailedKafkaEvent` import
- Applied fallback to `connection.requested` and `connection.accepted` publish failures

### routers/messages.py
- Added `_log_failed_kafka_event()` helper and `FailedKafkaEvent` import
- Applied fallback to `message.sent` publish failure

### routers/members.py
- Added `_log_failed_kafka_event()` helper and `FailedKafkaEvent` import
- Applied fallback to `profile.viewed` publish failure (replaced silent `pass`)

### SYSTEM_ARCHITECTURE.md
- Added "Why Kafka is Behind the API Layer" section
- Corrected "true microservices" to "modular monolith deployed as containerised services"

### README.md
- Fixed `application.submitted` consumer description
- Added "Why Kafka is Behind the API Layer" section
- Corrected microservices description

---

## 5. What Requires No Change

| Item | Status |
|------|--------|
| Event envelope format | Already standardised — no change needed |
| Offset commit mode | Already manual — no change needed |
| Idempotency | Already two-layer — no change needed |
| Dead-letter handling | Already present — no change needed |
| Consumer retry/backoff | Already implemented — no change needed |
| Pre-aggregated analytics | Already present — no change needed |
| AI Kafka coordination | Already implemented — no change needed |
| Docker Kafka listener config | Already correct — no change needed |
| Frontend → API → Kafka order | Already correct — no change needed |

---

## 6. Verification Commands

```bash
# Start the stack
docker compose up -d

# Submit an application (emits application.submitted to Kafka)
curl -s -X POST http://localhost:8000/applications/submit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <member_token>" \
  -d '{"job_id":1,"member_id":1,"cover_letter":"test"}'

# Verify consumer side effect — check MongoDB analytics aggregate
docker exec linkedin-mongodb mongosh linkedin --eval \
  'db.analytics_applications_daily.find().sort({date:-1}).limit(3).pretty()'

# Verify event log
docker exec linkedin-mongodb mongosh linkedin --eval \
  'db.event_logs.find({event_type:"application.submitted"}).sort({_id:-1}).limit(1).pretty()'

# Verify dead_letters is empty (healthy state)
docker exec linkedin-mongodb mongosh linkedin --eval \
  'db.dead_letters.countDocuments()'

# Verify failed_kafka_events is empty (healthy state)
docker exec linkedin-mysql mysql -u linkedin_user -plinkedin_pass linkedin \
  -e "SELECT COUNT(*) FROM failed_kafka_events;"

# Check Kafka consumer logs in analytics service
docker logs linkedin-analytics-service --tail=50 | grep -E "Processed|Skipping|Dead-letter|commit"
```
