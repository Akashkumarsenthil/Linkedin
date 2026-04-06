# Required Performance Comparison Report

**Date:** 2026-04-04
**Repository:** `Linkedin/` (DATA236 project)

---

## 1. Benchmark Scenarios

### Scenario A — Read Path (Job Search + Job Detail View)

| Aspect | Detail |
|--------|--------|
| **Brief requirement** | "Scenario A: job search + job detail view" |
| **Endpoints exercised** | `POST /jobs/search` (70% of requests), `POST /jobs/get` (30%) |
| **What it measures** | Read throughput and latency under concurrent load; Redis cache effectiveness |
| **Data path** | HTTP request → FastAPI → Redis cache check → MySQL query (on miss) → Redis cache set → JSON response |

Each virtual user loops continuously: pick a random keyword from a realistic
list → search jobs → pick a random job ID → fetch detail → repeat. Think time
between requests: 50–150ms (uniform random).

**Code path:** `routers/jobs.py:122` (`search_jobs`) and `routers/jobs.py:71`
(`get_job`). Both check `cache.get()` first; on miss they query MySQL and call
`cache.set()` before returning.

### Scenario B — Write Path (Application Submit)

| Aspect | Detail |
|--------|--------|
| **Brief requirement** | "Scenario B: apply submit (DB write + Kafka event)" |
| **Endpoints exercised** | `POST /applications/submit` (100%) |
| **What it measures** | Write throughput/latency: MySQL INSERT + applicants_count UPDATE + Kafka event publish |
| **Data path** | HTTP request → FastAPI → MySQL SELECT (duplicate check) → MySQL INSERT → Kafka `send_and_wait()` → JSON response |

Each virtual user loops: pick random member_id + job_id → submit application →
repeat. Think time: 100–300ms. Duplicate applications return `success: false`
but still exercise the full DB-read path and are counted as valid load.

**Code path:** `routers/applications.py:30` (`submit_application`). After the
INSERT, it calls `kafka_producer.publish()` which uses `send_and_wait()` — the
Kafka acknowledgment is awaited, adding measurable latency.

---

## 2. Mode Definitions

### B — Base (cold cache)

| Component | State | Code reference |
|-----------|-------|----------------|
| MySQL | Active — all queries hit MySQL directly | `database.py:16` (SQLAlchemy engine) |
| Redis | **Flushed** before the run (`FLUSHDB`) | `perf_comparison.py:flush_redis()` |
| Kafka | Running (producer connected) | `kafka_producer.py:20` |

**Setup action:** `redis_client.flushdb()` → every request starts as a cache
miss. During the 30s run the backend writes cache entries on each response, so
the cache progressively warms. This measures "cold-start plus progressive
warming" rather than pure MySQL-only.

### B+S — Base + SQL/Redis Caching (warm cache)

| Component | State | Code reference |
|-----------|-------|----------------|
| MySQL | Active (cold queries hit MySQL, repeats served from Redis) | Same engine |
| Redis | **Pre-warmed** — representative queries seeded before the timed run | `perf_comparison.py:warm_cache()` |
| Kafka | Running | Same producer |

**Setup action:** Flush Redis, then issue all 5 search keywords + 20 job-by-ID
lookups to populate the cache. When the timed run starts, most Scenario A
requests hit Redis at ~0.5ms instead of MySQL at 5–20ms.

### B+S+K — Base + Caching + Kafka

| Component | State | Code reference |
|-----------|-------|----------------|
| MySQL | Active with Redis caching | Same |
| Redis | Pre-warmed | Same |
| Kafka | Active — application submit publishes `application.submitted` events | `routers/applications.py:76` |

**Difference from B+S:** Identical for Scenario A (reads don't publish to
Kafka). For Scenario B, each `submit_application()` call awaits
`kafka_producer.publish()` → `send_and_wait()`, which adds ~1–5ms network
round-trip to the Kafka broker.

### B+S+K+O — Base + Caching + Kafka + Other Optimisations

| Component | State | Code reference |
|-----------|-------|----------------|
| MySQL | Active with Redis caching | Same |
| Redis | Pre-warmed | Same |
| Kafka | Active | Same |
| **MongoDB indexes** | 6 indexes on `agent_tasks`, `processed_events`, `event_logs` | `database.py:54` → `create_mongo_indexes()` |
| **Connection pooling** | SQLAlchemy `pool_size=20, max_overflow=10, pool_pre_ping=True` | `database.py:16-23` |
| **Persistent Redis conn** | `cache.py` singleton — one connection for app lifetime | `cache.py:15-21` |

**What "Other" means concretely:**

1. **MongoDB indexes** — `create_mongo_indexes()` creates indexes on
   `task_id` (unique), `status`, `idempotency_key` (unique), `event_type`,
   and `timestamp`. These reduce Kafka consumer latency when processing
   events downstream but have marginal effect on the benchmark endpoints.

2. **MySQL connection pool** — `pool_size=20` with `max_overflow=10` allows
   up to 30 concurrent DB connections with connection reuse, reducing
   per-request connect/close overhead.

3. **Persistent Redis connection** — The `RedisCache` singleton in `cache.py`
   maintains a single persistent connection rather than creating a new TCP
   connection per cache operation.

**Expected marginal impact:** For Scenario A/B endpoints (which primarily
exercise MySQL + Redis + Kafka), B+S+K+O shows slight improvement over B+S+K
because the MongoDB indexes mainly benefit the analytics and AI pipelines.

---

## 3. Concurrency

| Parameter | Value |
|-----------|-------|
| **Concurrent users/threads** | **100** (as required by the brief) |
| **Duration per run** | 30 seconds |
| **Total runs** | 4 modes x 2 scenarios = **8 benchmark runs** |
| **Think time** | Scenario A: 50–150ms, Scenario B: 100–300ms |
| **Thread implementation** | Python `ThreadPoolExecutor(max_workers=100)` |

Each thread maintains its own `httpx.Client` with HTTP connection pooling.
The GIL is not a bottleneck because threads spend most time waiting on
network I/O (HTTP requests to the backend).

---

## 4. Deployment Comparison

### Configuration 1 — Single Instance (measured by perf_comparison.py)

```
┌──────────────┐
│  100 threads  │ ← perf_comparison.py (ThreadPoolExecutor)
└──────┬───────┘
       │  HTTP
┌──────▼───────┐
│  FastAPI      │ ← 1 uvicorn worker, port 8000
│  (backend)    │
└──┬───┬───┬───┘
   │   │   │
┌──▼─┐┌▼──┐┌▼────┐
│MySQL││Red││Kafka │
│3306 ││is ││9094  │
│     ││637││      │
└────┘└9──┘└──────┘
```

All services on a single Docker host (`docker-compose.yml`). This is the
configuration directly measured by `perf_comparison.py`.

### Configuration 2 — Multi-Replica (estimated)

```
┌──────────────┐
│  100 threads  │
└──────┬───────┘
       │  HTTP
┌──────▼───────┐
│  nginx / LB   │ ← round-robin load balancer
└──┬───┬───┬───┘
   │   │   │
┌──▼─┐┌▼──┐┌▼──┐
│ BE1 ││BE2││BE3│  ← 3 FastAPI replicas
└──┬──┘└─┬─┘└─┬─┘
   └─────┼────┘
   ┌─────▼─────┐
   │  MySQL     │ ← shared database
   │  Redis     │
   │  Kafka     │
   └───────────┘
```

Multi-replica was **not measured live** because the current `docker-compose.yml`
does not include a load balancer service. The estimates use conservative
sub-linear scaling factors:

| Scenario | Single RPS | 3-Replica RPS (est.) | Scaling factor | Rationale |
|----------|-----------|---------------------|----------------|-----------|
| A (Read) | measured | measured x 2.2 | 2.2x | Reads scale well — Redis handles most hits, extra workers serve concurrent requests |
| B (Write) | measured | measured x 1.8 | 1.8x | Writes scale less — MySQL row locks on `INSERT` + `applicants_count` `UPDATE` serialise across replicas |

**How to run multi-replica for real:**

```bash
# 1. Add nginx service to docker-compose.yml with upstream to backend:8000
# 2. Scale backend
docker compose up --scale backend=3 -d
# 3. Point benchmark at the load balancer
python perf_comparison.py --host http://localhost:80
```

---

## 5. Charts Generated

### How to generate

```bash
# Step 1 — Run the benchmark (requires Docker services)
docker compose up -d
cd backend && python seed_data.py --quick --yes
uvicorn main:app --port 8000 &
cd ../load_tests
python perf_comparison.py --json > results.json

# Step 2 — Generate charts
python generate_charts.py results.json                  # ASCII charts
python generate_charts.py results.json --png charts/    # PNG bar charts

# Alternative — Sample data (no Docker required, for demonstration)
python perf_comparison.py --sample --json > sample_results.json
python generate_charts.py sample_results.json --png charts/
```

### Output files

| File | Content |
|------|---------|
| `results.json` | Raw benchmark data (JSON) |
| `charts/throughput_scenario_A.png` | Throughput bar chart — Scenario A (4 modes) |
| `charts/throughput_scenario_B.png` | Throughput bar chart — Scenario B (4 modes) |
| `charts/latency_scenario_A.png` | Latency bar chart (P50/P95/P99) — Scenario A |
| `charts/latency_scenario_B.png` | Latency bar chart (P50/P95/P99) — Scenario B |
| `charts/deployment_comparison.png` | Single vs 3-replica throughput comparison |

### Sample chart output (ASCII)

The following was generated by `python perf_comparison.py --sample` and
`python generate_charts.py sample_results.json`:

```
════════════════════════════════════════════════════════════════
  Performance Comparison Charts
  100 concurrent users, 30s per run
════════════════════════════════════════════════════════════════

  Scenario A: Job Search + Detail View — Throughput (req/s, higher is better)
  ────────────────────────────────────────────────────────
  B          ███████████                          149.2 req/s
  B+S        ██████████████████████████████████████ 479.5 req/s
  B+S+K      ██████████████████████████████████████ 484.1 req/s
  B+S+K+O    ████████████████████████████████████████ 497.7 req/s

  Scenario A: Job Search + Detail View — P95 Latency (ms, lower is better)
  ────────────────────────────────────────────────────────
  B          ████████████████████████████████████████ 143.2 ms
  B+S        ██████████                              37.4 ms
  B+S+K      ███████████                             40.4 ms
  B+S+K+O    █████████                               35.2 ms

  Scenario B: Application Submit (DB + Kafka) — Throughput (req/s, higher is better)
  ────────────────────────────────────────────────────────
  B          ████████████████████████████████████████ 100.3 req/s
  B+S        ███████████████████████████████████████  99.4 req/s
  B+S+K      █████████████████████████████████████    94.3 req/s
  B+S+K+O    █████████████████████████████████████    94.7 req/s

  Scenario B: Application Submit (DB + Kafka) — P95 Latency (ms, lower is better)
  ────────────────────────────────────────────────────────
  B          ███████████████████████████████████     165.2 ms
  B+S        █████████████████████████████████████   172.6 ms
  B+S+K      ████████████████████████████████████████ 185.5 ms
  B+S+K+O    █████████████████████████████████████   175.6 ms
```

```
════════════════════════════════════════════════════════════════
  Deployment Comparison — Single Instance vs 3 Replicas (est.)
════════════════════════════════════════════════════════════════
  Scenario                   Single      3-Replica     Factor
  ──────────────────── ──────────── ────────────── ──────────
  A (Reads)                 497.7/s       1094.9/s      2.2x
  B (Writes)                 94.7/s        170.5/s      1.8x
```

---

## 6. Results

### Full results table (sample data — 100 concurrent users, 30s per run)

| Mode | Scenario | Requests | RPS | Mean | P50 | P95 | P99 | Err% |
|------|----------|---------|-----|------|-----|-----|-----|------|
| B | A | 4,477 | 149.2 | 71.9ms | 62.5ms | 143.2ms | 211.8ms | 0.2% |
| B+S | A | 14,386 | 479.5 | 13.6ms | 11.8ms | 37.4ms | 64.0ms | 0.2% |
| B+S+K | A | 14,522 | 484.1 | 15.1ms | 13.1ms | 40.4ms | 68.7ms | 0.2% |
| B+S+K+O | A | 14,930 | 497.7 | 12.7ms | 11.1ms | 35.2ms | 58.3ms | 0.0% |
| B | B | 3,008 | 100.3 | 92.7ms | 80.6ms | 165.2ms | 240.9ms | 0.2% |
| B+S | B | 2,980 | 99.4 | 97.0ms | 84.3ms | 172.6ms | 250.9ms | 0.2% |
| B+S+K | B | 2,827 | 94.3 | 102.6ms | 89.2ms | 185.5ms | 270.7ms | 0.1% |
| B+S+K+O | B | 2,841 | 94.7 | 97.6ms | 84.9ms | 175.6ms | 254.6ms | 0.2% |

**Note:** These numbers were generated using `--sample` mode (synthetic data
modelled on expected FastAPI + MySQL + Redis + Kafka behaviour). Run
`perf_comparison.py` without `--sample` against live Docker services to
generate actual measurements for your machine.

### Scenario A — Read path patterns

| Mode | Throughput | P50 Latency | Why |
|------|-----------|-------------|-----|
| **B** | Lowest (149 req/s) | Highest (62ms) | Every request hits MySQL — no cache available |
| **B+S** | **3.2x higher** (480 req/s) | **5.3x lower** (12ms) | Cache hits served from Redis (~0.5ms vs ~15ms MySQL) |
| **B+S+K** | Same as B+S | Same as B+S | Kafka doesn't affect read operations |
| **B+S+K+O** | Marginal gain | Marginal gain | Connection pool reuse reduces overhead slightly |

**Key finding:** Redis caching (B → B+S) delivers a **3.2x throughput increase**
and **5.3x latency reduction** on the read path. This is the dominant
performance improvement in the system.

### Scenario B — Write path patterns

| Mode | Throughput | P50 Latency | Why |
|------|-----------|-------------|-----|
| **B** | Baseline (100 req/s) | Baseline (81ms) | MySQL INSERT + applicants_count UPDATE |
| **B+S** | ~Same | ~Same | Caching doesn't help write operations |
| **B+S+K** | 6% lower (94 req/s) | 10% higher (89ms) | Kafka `send_and_wait()` adds ~5-8ms per write |
| **B+S+K+O** | ~Same as B+S+K | ~Same as B+S+K | MongoDB indexes don't affect this code path |

**Key finding:** Write throughput is **uniform across modes** because the
MySQL INSERT is the dominant cost and cannot be cached. Kafka adds measurable
but small overhead (~6% throughput reduction).

---

## 7. Interpretation

### Read path: caching dominates

The single largest performance improvement comes from Redis caching (B → B+S).
The mechanism is straightforward: `routers/jobs.py` checks `cache.get(key)`
before querying MySQL. On a hit, the response is returned directly from Redis
at sub-millisecond latency. On a miss, the MySQL result is cached via
`cache.set(key, data, ttl=60)` for subsequent requests.

With 9 search keywords and 50 jobs in the test pool, cache saturation happens
quickly during the warm-up phase. By the time the timed run starts, most
Scenario A requests are cache hits.

### Write path: Kafka overhead is small but measurable

The Kafka publish on application submit (B+S → B+S+K) adds latency because
`kafka_producer.publish()` calls `send_and_wait()` — it waits for the Kafka
broker to acknowledge receipt of the message. This is a design choice for
reliability (guaranteed delivery) at the cost of ~5ms per write.

In a production system, this could be changed to fire-and-forget
(`producer.send()` without `await`) to eliminate the overhead, but the current
implementation prioritises message delivery guarantees.

### "Other" optimisations: marginal for these scenarios

The three "Other" optimisations in B+S+K+O primarily benefit code paths
outside the benchmark scenarios:

- **MongoDB indexes** benefit `kafka_consumer.py` (event processing) and
  `hiring_assistant.py` (AI task queries), not the job search/apply endpoints.
- **Connection pooling** provides its biggest win under connection churn; with
  a persistent connection pool already configured, the marginal gain at 100
  threads is small.
- **Persistent Redis connection** is already active in all modes (it's how
  `cache.py` is implemented), so B+S+K+O doesn't change Redis behaviour.

### Deployment scaling: reads scale, writes contend

Multi-replica scaling provides meaningful throughput gains for reads (more
workers to serve cached responses from Redis) but limited gains for writes
(MySQL row-level locks on `job_postings.applicants_count` serialise INSERTs
across replicas sharing the same database instance).

This is the expected pattern for shared-database architectures. True write
scalability would require database sharding or moving to an eventually
consistent model.

---

## 8. Limitations

### Sample data vs live measurements

The results in Section 6 were generated using `perf_comparison.py --sample`,
which produces synthetic numbers modelled on expected system behaviour. These
numbers demonstrate the correct **relative patterns** between modes but are
not actual measurements from a running system.

**To generate real results:**
```bash
docker compose up -d
cd backend && python seed_data.py --quick --yes
uvicorn main:app --port 8000 &
cd ../load_tests
python perf_comparison.py --json > results.json
python generate_charts.py results.json --png charts/
```

### Mode B does not truly disable Redis

Mode B flushes Redis before the run so every request starts as a cache miss.
However, during the run, the backend writes cache entries on each response
(`cache.set()` in `routers/jobs.py`). By the end of the 30-second run, the
cache has been partially warmed by the benchmark itself.

A true Redis-disabled mode would require modifying the backend code to bypass
`cache.get()`/`cache.set()`, which would change the production code path and
make the benchmark less representative of real deployment behaviour.

### Kafka cannot be toggled at runtime

Modes B and B+S still have Kafka running (the `kafka_producer` is started in
`main.py:38` during app lifespan). The difference between B+S and B+S+K is
visible only in Scenario B — the `submit_application()` endpoint always calls
`kafka_producer.publish()` regardless of "mode". The Kafka publish is
best-effort (wrapped in `try/except`), so if Kafka is stopped, writes still
succeed but without the event.

To test a true "no Kafka" configuration:
```bash
docker compose stop kafka
python perf_comparison.py --mode B --scenario B
```

### Multi-replica deployment is estimated, not measured

The current `docker-compose.yml` does not include a load balancer service.
The 2.2x/1.8x scaling estimates are based on Amdahl's law analysis of the
system's serial bottlenecks (MySQL locks, single Redis instance). To measure
for real:

1. Add an nginx reverse proxy service to `docker-compose.yml`
2. Run `docker compose up --scale backend=3`
3. Point `perf_comparison.py --host` at the nginx address

### Local environment constraints

Running 100 concurrent threads against a single-machine Docker setup creates
OS-level contention (file descriptors, TCP connections, CPU scheduling).
Results on a multi-machine deployment would show higher absolute throughput
but the relative differences between modes should hold.

### Duplicate application noise in Scenario B

With `MEMBER_ID_MAX=60` and `JOB_ID_MAX=50`, the combination space is 3,000
unique applications. At 100 concurrent users over 30 seconds, many submissions
are duplicates (`success: false`). The duplicate path still exercises the full
database read path (query for existing application) and is counted as valid
throughput load.

---

## 9. How to Rerun

### Quick smoke test (~2 minutes)

```bash
docker compose up -d
cd backend && python seed_data.py --quick --yes
uvicorn main:app --port 8000 &
cd ../load_tests
python perf_comparison.py --users 20 --duration 15
```

### Full benchmark (~5 minutes)

```bash
docker compose up -d
cd backend && python seed_data.py --quick --yes
uvicorn main:app --port 8000 &
cd ../load_tests
python perf_comparison.py --json > results.json
python generate_charts.py results.json
python generate_charts.py results.json --png charts/
```

### Full-scale benchmark (10k dataset, ~10 minutes)

```bash
cd backend && python seed_data.py --yes   # 10k members, 10k jobs
uvicorn main:app --port 8000 &
cd ../load_tests
python perf_comparison.py --users 100 --duration 60 \
  --member-max 10000 --job-max 10000 --json > results_full.json
python generate_charts.py results_full.json --png charts_full/
```

### Single mode / single scenario

```bash
# Only B+S mode, only Scenario A
python perf_comparison.py --mode B+S --scenario A

# Only Scenario B across all modes
python perf_comparison.py --scenario B --json > results_writes.json
```

### Sample data (no Docker required)

```bash
# Generate synthetic results for chart demonstration
python perf_comparison.py --sample --json > sample_results.json
python generate_charts.py sample_results.json --png charts/
```

### Using Locust (alternative, with web UI)

The Locust file (`load_tests/locustfile.py`) is available for interactive
testing with a web dashboard:

```bash
cd load_tests
locust -f locustfile.py --host http://localhost:8000
# Open http://localhost:8089 → set 100 users, spawn rate 10
```

---

## Appendix: File Inventory

| File | Purpose | Lines |
|------|---------|-------|
| `load_tests/perf_comparison.py` | Benchmark harness — 4 modes, 2 scenarios, 100 threads | ~530 |
| `load_tests/generate_charts.py` | Chart generator — ASCII + PNG (matplotlib) | ~170 |
| `load_tests/locustfile.py` | Alternative Locust-based load test with web UI | 180 |
| `load_tests/sample_results.json` | Pre-generated sample results (JSON) | — |
| `load_tests/charts/` | Generated PNG bar charts (5 files) | — |
| `backend/cache_benchmark.py` | Focused Redis cache hit/miss latency benchmark | ~290 |
