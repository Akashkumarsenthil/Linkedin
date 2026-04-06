# Profile View Event Update

**Date:** 2026-04-06

---

## What Was Missing

Two gaps prevented `profile.viewed` events from flowing through the system:

### Gap 1 — Producer: `/members/get` never published the event

`backend/routers/members.py` — the `get_member` endpoint retrieved the member
profile (from Redis cache or MySQL) but never called `kafka_producer.publish()`.
The `profile.viewed` Kafka topic received zero events from actual API traffic.

### Gap 2 — Topic subscription: consumer never subscribed to `profile.viewed`

`backend/main.py` — the startup topics list passed to `kafka_consumer.start()`
did not include `"profile.viewed"`. Even if a producer had published the event,
the `AIOKafkaConsumer` would have silently ignored it because it was not
subscribed to that topic.

The consumer handler (`handle_profile_viewed` in `kafka_consumer.py`) and the
`ProfileViewDaily` MySQL table were both already implemented correctly and waiting
for events that never arrived.

---

## What Was Changed

### `backend/routers/members.py` — added Kafka publish in `get_member`

Added 9 lines after the cache `set` call, following the identical pattern used
by `get_job` in `routers/jobs.py` for `job.viewed`:

```python
# Publish profile view event (mirrors job.viewed pattern in routers/jobs.py)
try:
    await kafka_producer.publish(
        topic="profile.viewed",
        event_type="profile.viewed",
        actor_id="system",
        entity_type="member",
        entity_id=str(req.member_id),
        payload={},
    )
except Exception:
    pass
```

The event is published **only on the DB-hit path** (cache miss). Cache-hit
responses do not publish the event — this matches the `job.viewed` behaviour
and avoids re-counting views that were already counted on the first DB read.

### `backend/main.py` — added `"profile.viewed"` to consumer topics

Added one line to the topics list in the `lifespan` startup function:

```python
topics = [
    "job.viewed", "job.saved", "job.created", "job.closed",
    "application.submitted", "application.statusChanged",
    "message.sent", "connection.requested", "connection.accepted",
    "profile.viewed",          # ← added
    "ai.requests", "ai.results",
]
```

---

## Files Changed

| File | Change | Lines |
|------|--------|-------|
| `backend/routers/members.py` | Added `kafka_producer.publish()` call in `get_member` | +9 |
| `backend/main.py` | Added `"profile.viewed"` to consumer topics list | +1 |

No other files were changed. `kafka_consumer.py` required no modification
— `handle_profile_viewed` and its handler registration were already present.

---

## How the Event Now Flows

```
POST /members/get
     │
     ├─ cache hit  → return cached response  (no event — view already counted)
     │
     └─ cache miss
          │
          ├─ MySQL SELECT members WHERE member_id = ?
          ├─ cache.set(key, data, ttl=300)
          │
          ├─ kafka_producer.publish("profile.viewed")
          │       topic="profile.viewed"
          │       entity_type="member", entity_id="<member_id>"
          │       actor_id="system"
          │
          └─ return MemberResponse(success=True, ...)

Kafka broker (topic: "profile.viewed")
     │
     └─ AIOKafkaConsumer (group: linkedin-backend)
          │
          ├─ idempotency check (in-memory set + MongoDB processed_events)
          │
          └─ handle_profile_viewed(event)
                  │
                  ├─ SELECT profile_views_daily WHERE member_id=? AND view_date=today
                  ├─ if exists: view_count += 1
                  ├─ else: INSERT new row (member_id, today, 1)
                  ├─ db.commit()
                  └─ mongo_db.event_logs.insert_one(event)
```

The `profile_views_daily` table is already read by
`POST /analytics/profile-views` (`routers/analytics.py:218`) to serve the
recruiter dashboard — no analytics code needed to change.

---

## Standard Envelope

The published event uses the existing `KafkaEventProducer.publish()` envelope
unchanged:

```json
{
  "event_type": "profile.viewed",
  "trace_id": "<uuid>",
  "timestamp": "2026-04-06T10:00:00.000Z",
  "actor_id": "system",
  "entity": {
    "entity_type": "member",
    "entity_id": "42"
  },
  "payload": {},
  "idempotency_key": "<uuid>"
}
```

`actor_id` is set to `"system"` because the current `/members/get` request
body (`MemberGet`) contains only `member_id` — there is no viewer identity in
the request. This matches the `job.viewed` convention in `routers/jobs.py:91`
which also uses `actor_id="system"`.

---

## Limitations

### Cache-hit views are not counted

A profile returned from Redis cache (within the 300-second TTL window) does not
publish a `profile.viewed` event. Repeated lookups of the same profile within
5 minutes count as one view in `profile_views_daily`. This is consistent with
the `job.viewed` behaviour and avoids inflating view counts from repeated reads.

### No viewer identity

`actor_id` is hardcoded to `"system"` because the API does not require
authentication — the request carries no session token or viewer member_id. If
viewer tracking (who viewed whose profile) is added later, the `actor_id` field
in the envelope is ready to carry that value.

### Event is fire-and-forget

The `publish()` call is wrapped in `try/except Exception: pass` — if Kafka is
unavailable, the profile is still returned and the view is silently not counted.
This is the same reliability trade-off used by all other view events in the system.
