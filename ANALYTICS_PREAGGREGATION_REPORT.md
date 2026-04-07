# ANALYTICS_PREAGGREGATION_REPORT

## 1. Problem Statement

Two analytics endpoints were performing expensive on-demand computation on every HTTP request:

| Endpoint | Data Source | Hot-path Cost |
|---|---|---|
| `POST /analytics/jobs/clicks` | MongoDB `event_logs` — full collection scan + `$group` aggregation | O(events in window) — grows unboundedly as events accumulate |
| `POST /analytics/saves/trend` | MySQL `saved_jobs` — `GROUP BY date(saved_at)` full table scan | O(saved_jobs rows) — same growth problem |

Both endpoints back live recruiter dashboards and could be called frequently.  At low
volume (a few thousand events) the queries are fast; at moderate volume (hundreds of
thousands of events) they add seconds of latency per request and put unnecessary load
on both databases.

---

## 2. Pre-aggregation Strategy

### Principle

Rather than computing aggregates at read time, we compute them **incrementally at write
time** — specifically inside the Kafka consumer handlers that already run for every
relevant event.  Each new event adds exactly one `$inc` to a small summary document
instead of growing the raw collection that the dashboard must later scan.

### Collections Added

#### `analytics_job_clicks_daily`

Tracks clicks (job.viewed events) per job per calendar day.

```json
{
  "job_id": 42,
  "date": "2026-04-06",
  "clicks": 17
}
```

Maintained by: `handle_job_viewed` in `kafka_consumer.py`
```python
await mongo_db.analytics_job_clicks_daily.update_one(
    {"job_id": int(job_id), "date": today_str},
    {"$inc": {"clicks": 1}},
    upsert=True,
)
```

#### `analytics_saves_daily`

Tracks saved-job events per calendar day, with a pre-computed ISO week label for
weekly roll-ups.

```json
{
  "date": "2026-04-06",
  "week": "2026-W14",
  "saves": 5
}
```

Maintained by: `handle_job_saved` in `kafka_consumer.py` (new dedicated handler,
replacing `handle_generic_event` for the `job.saved` topic)
```python
await mongo_db.analytics_saves_daily.update_one(
    {"date": today_str},
    {"$inc": {"saves": 1}, "$set": {"week": week_str}},
    upsert=True,
)
```

---

## 3. Files Changed

### `backend/kafka_consumer.py`

1. **`handle_job_viewed`** — after the existing MySQL `views_count` increment and
   MongoDB `event_logs` insert, now also upserts into `analytics_job_clicks_daily`.

2. **`handle_job_saved`** (new function) — logs the event to `event_logs` *and*
   upserts into `analytics_saves_daily`.  ISO week label is computed with
   `strftime("%G-W%V")` (ISO 8601 week numbering).

3. **Handler registration** — `job.saved` now maps to `handle_job_saved` instead of
   `handle_generic_event`.  Generic logging still happens inside `handle_job_saved`.

### `backend/routers/analytics.py`

**`clicks_per_job`** (updated)

Before: full `$match` + `$group` over `event_logs`.

After: reads from `analytics_job_clicks_daily`, grouping pre-aggregated daily
counters:
```python
pipeline = [
    {"$match": {"date": {"$gte": cutoff_date}}},      # O(days × jobs in window)
    {"$group": {"_id": "$job_id", "clicks": {"$sum": "$clicks"}}},
    {"$sort": {"clicks": -1}},
    {"$limit": req.limit},
]
```
Fallback: if the pre-aggregated collection is empty (fresh deployment before any
`job.viewed` event is processed), automatically falls back to the original
`event_logs` scan so the endpoint never returns empty results during migration.

**`saves_trend`** (updated)

Before: MySQL `GROUP BY date(saved_at)` or `date_format(saved_at, "%x-W%v")`.

After: queries `analytics_saves_daily` directly.  Weekly granularity is computed by
collapsing the per-day `saves` counts by the pre-stored `week` field in Python — no
additional MongoDB aggregation required.

Fallback: same pattern — if the collection is empty, falls back to MySQL GROUP BY.

### `backend/database.py`

Added indexes for both new collections in `create_mongo_indexes()`:

| Collection | Index | Purpose |
|---|---|---|
| `analytics_job_clicks_daily` | `(job_id, date)` unique | upsert lookup; query by date window |
| `analytics_job_clicks_daily` | `date` | range filter in aggregation `$match` |
| `analytics_saves_daily` | `date` unique | upsert lookup + range filter |
| `analytics_saves_daily` | `week` | supports future weekly range queries |

---

## 4. Query Complexity Before vs After

### `clicks_per_job`

| | Before | After |
|---|---|---|
| Scan target | All `event_logs` documents matching `event_type=job.viewed` in window | `analytics_job_clicks_daily` docs in date window |
| Document count at 100k events/month | ~100k | ~(jobs × days) ≈ hundreds |
| Index used | `event_type_1` (partial; still scans matching docs) | `job_id_date_unique` (covered) |
| Aggregation | `$group` over raw events → many-to-one | `$group` over already-grouped counters → trivial |

### `saves_trend`

| | Before | After |
|---|---|---|
| Scan target | All `saved_jobs` rows in MySQL | `analytics_saves_daily` docs in date window |
| Row count at 50k saves/month | ~50k | ≤ window_days (≤ 90) |
| Sort/group | `GROUP BY date()` full-table | Python dict collapse over ≤ 90 docs |

---

## 5. Delivery Guarantees and Consistency

Because the summary collections are maintained inside the **Kafka consumer** (after
`handler()` succeeds and *before* `commit()`), they inherit the same at-least-once
delivery guarantee as all other side-effects:

- If the process crashes after `handle_job_viewed` increments `analytics_job_clicks_daily`
  but before the offset is committed, the event is redelivered on restart.
- The idempotency record check (`processed_events`) catches the re-delivery and skips
  the handler entirely — so the pre-aggregated counter is **not double-incremented**.
- The ordering in the consume loop is:
  1. `handler()` (MySQL write + MongoDB event_log + pre-agg upsert)
  2. `insert_one(processed_events)` (idempotency record)
  3. `commit()` (offset advanced)

This means the pre-aggregated counter is always consistent with the idempotency record.

---

## 6. Backfill Note

The pre-aggregated collections only contain data for events processed *after* this
change is deployed.  Historical events already in `event_logs` / `saved_jobs` are not
backfilled automatically.  During the transition period the **fallback paths** in both
endpoints serve historical data from the original sources.

If a full backfill is desired, a one-time migration script can replay `event_logs`
and `saved_jobs` rows into the summary collections using the same upsert pattern.

---

## 7. Limitations

1. **Daily granularity only for clicks**: `analytics_job_clicks_daily` rolls up at
   the day boundary.  If sub-day granularity is ever needed (e.g., hourly heatmaps),
   an `analytics_job_clicks_hourly` collection would need to be added with a shorter
   TTL.

2. **Clock skew**: `date.today()` uses the server's local date.  Events ingested just
   after midnight may land on a different day from the event's payload timestamp.  For
   this use case (dashboard approximations) this is acceptable.

3. **Fallback scan**: The `event_logs` fallback in `clicks_per_job` will remain until
   the pre-aggregated collection covers the full `window_days` look-back.  After
   `window_days` of traffic the fallback path becomes unreachable.

4. **No pre-aggregation for `top_jobs` (applications/views/saves)**: These remain
   live MySQL queries.  The `views` metric already uses the pre-aggregated
   `views_count` column on `job_postings` (maintained by `handle_job_viewed`).
   Application and save counts are only aggregated across the window at query time;
   adding a summary table for these would follow the same pattern if needed.
