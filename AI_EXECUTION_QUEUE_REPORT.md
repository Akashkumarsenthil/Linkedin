# AI_EXECUTION_QUEUE_REPORT

## 1. Previous Bottleneck

### What the code did

`start_task()` in `hiring_assistant.py` ended with:

```python
asyncio.create_task(run_hiring_workflow(task_id, job_id, top_n))
return task_id
```

Every `POST /ai/analyze-candidates` request **immediately** launched a new concurrent
workflow coroutine, regardless of how many were already running.

### Why this was a bottleneck

The hiring workflow makes sequential HTTP calls to **Ollama**, a single-threaded local
LLM server:

```
run_hiring_workflow
  ├─ parse_resume_with_ollama()      ← HTTP POST to Ollama (per candidate)
  ├─ match_candidate_to_job()        ← CPU + regex (fast, but N iterations)
  └─ generate_outreach_with_ollama() ← HTTP POST to Ollama (per shortlisted candidate)
```

With N concurrent workflows, the pattern was:

```
Recruiter A → create_task(workflow-A)  → starts immediately
Recruiter B → create_task(workflow-B)  → starts immediately
Recruiter C → create_task(workflow-C)  → starts immediately
```

All three workflows now make simultaneous Ollama requests.  Ollama serializes them
internally (one inference at a time), so each workflow stalls waiting for Ollama to
finish the previous caller's inference.  From the application's perspective, response
times for all three grow linearly with N.  There was also no backpressure: each new
request made things worse for all existing ones.

### Secondary bug

`rehydrate_tasks()` (called at startup) treated both `"queued"` and `"running"`
tasks as `_INTERRUPTED_ON_RESTART`, marking them both as `"interrupted"`.  A task
that was in the MongoDB queue but had never been dispatched (status `"queued"`) was
permanently abandoned on restart.  The correct behavior is to re-submit it.

---

## 2. Architecture Chosen

### Decision

**asyncio.Queue + asyncio.Semaphore dispatcher** within the existing process.

Rejected alternatives:

| Option | Why rejected |
|---|---|
| Celery | Adds Redis as broker + Celery worker process; significant infra and config overhead for a demo platform |
| Kafka task queue | The `ai.requests` Kafka topic is already published but never consumed.  Wiring the Kafka consumer to dispatch AI workflows would mean the Kafka consumer loop (which handles domain events like `job.viewed`) stalls for the full workflow duration — up to 60+ seconds per message.  This would be a regression for the analytics pipeline. |
| Ray / concurrent.futures | Overkill; introduces new dependencies |

The asyncio approach:
- **Zero new infrastructure** — runs inside the existing FastAPI/asyncio process
- **Natural fit** — the codebase is fully async; Queue and Semaphore are first-class asyncio primitives
- **Meaningful improvement** — bounded concurrency directly addresses the Ollama hammering problem
- **Queue durability on restart** — "queued" tasks in MongoDB are re-submitted after restart

### How it works

```
POST /analyze-candidates
  └─ start_task()
       ├─ insert_one(agent_tasks, status="queued")   ← persisted immediately
       ├─ active_tasks[task_id] = task_doc           ← in-memory cache warm
       ├─ Kafka publish (best-effort)
       └─ _task_queue.put((task_id, job_id, top_n))  ← enqueue, return immediately


Background: run_dispatcher() (asyncio.Task, started in main.py lifespan)
  └─ loop:
       ├─ await _task_queue.get()                    ← blocks until work arrives
       └─ asyncio.create_task(_workflow_runner(...)) ← non-blocking, returns to queue

_workflow_runner(task_id, job_id, top_n)
  └─ async with _workflow_semaphore:                 ← waits for a concurrency slot
       └─ run_hiring_workflow(task_id, job_id, top_n)
```

With `MAX_CONCURRENT_WORKFLOWS = 2`:
- At most 2 Ollama-calling workflows run simultaneously
- Additional workflows wait in `_task_queue` (fast asyncio.Queue.get())
- The HTTP response is still immediate — the task is persisted and queryable as
  `"queued"` before the request returns

---

## 3. Files Changed

| File | Change |
|---|---|
| `backend/agents/hiring_assistant.py` | New constants `MAX_CONCURRENT_WORKFLOWS`, `_task_queue`, `_workflow_semaphore`; new `_REQUEUEABLE_STATUSES`; `_INTERRUPTED_ON_RESTART` reduced to `{"running"}`; added `_workflow_runner()`, `run_dispatcher()`, `get_queue_stats()`; `start_task()` enqueues instead of `create_task`; `rehydrate_tasks()` re-queues "queued" tasks |
| `backend/main.py` | Import `run_dispatcher`; create dispatcher background task in lifespan startup; cancel and await it in shutdown |
| `backend/routers/ai_service.py` | Import `get_queue_stats`; add `GET /ai/queue-status` endpoint |

### `hiring_assistant.py` key diff (conceptual)

```python
# Before — start_task()
asyncio.create_task(run_hiring_workflow(task_id, job_id, top_n))

# After — start_task()
await _task_queue.put((task_id, job_id, top_n))
```

```python
# Before — rehydrate_tasks()
_INTERRUPTED_ON_RESTART = {"queued", "running"}
# → ALL queued tasks were abandoned on restart

# After — rehydrate_tasks()
_REQUEUEABLE_STATUSES   = {"queued"}   # re-submitted to _task_queue
_INTERRUPTED_ON_RESTART = {"running"}  # mid-flight, cannot resume
```

```python
# Before — main.py (nothing)

# After — main.py lifespan startup
dispatcher_task = asyncio.create_task(run_dispatcher(), name="ai-dispatcher")
# shutdown:
dispatcher_task.cancel()
await asyncio.gather(dispatcher_task, return_exceptions=True)
```

---

## 4. New Execution Flow

### Happy path (single task)

```
t=0    POST /ai/analyze-candidates { job_id: 1 }
t=0    MongoDB: insert { task_id: "abc", status: "queued" }
t=0    _task_queue.put("abc", 1, 5)
t=0    HTTP 200 → { task_id: "abc" }

t=0+ε  Dispatcher wakes, dequeues "abc"
t=0+ε  create_task(_workflow_runner("abc", 1, 5))
t=0+ε  _workflow_runner acquires semaphore (slot 1 of 2 now used)
t=1    run_hiring_workflow: fetch_data → MongoDB update, WS push
t=10   run_hiring_workflow: parse_resumes → Ollama calls
t=40   run_hiring_workflow: match_candidates
t=55   run_hiring_workflow: generate_outreach → Ollama calls
t=60   run_hiring_workflow: status → "awaiting_approval"
t=60   Semaphore released (slot available again)
```

### Concurrent requests (3 tasks, MAX_CONCURRENT=2)

```
t=0   Task A → queued, enqueued
t=0   Task B → queued, enqueued
t=1   Task C → queued, enqueued

Dispatcher:
  t=0+ε  dequeue A → create_task(runner-A) → runner-A acquires slot 1
  t=0+ε  dequeue B → create_task(runner-B) → runner-B acquires slot 2
  t=1+ε  dequeue C → create_task(runner-C) → runner-C BLOCKS on semaphore

t=60  runner-A completes → releases slot → runner-C acquires slot, starts
```

A, B run concurrently.  C waits with zero CPU overhead (asyncio semaphore
blocking) until a slot frees.  Ollama is called by at most 2 workflows at once.

### Restart scenario

```
Before restart:
  Task X: status="queued"  (never dispatched)
  Task Y: status="running" (was mid-flight)
  Task Z: status="awaiting_approval" (done, waiting for recruiter)

On startup rehydrate_tasks():
  X → re-submitted to _task_queue (will run after dispatcher starts)
  Y → marked "interrupted" in MongoDB
  Z → loaded into active_tasks (approval endpoint works)

Dispatcher starts:
  X → dequeued, dispatched normally
```

---

## 5. Reliability Implications

### What improved

| Scenario | Before | After |
|---|---|---|
| N concurrent requests | N workflows start simultaneously | 2 run, rest queue |
| Ollama saturation | N parallel inference requests | Max 2 at a time |
| "queued" task + restart | Lost (marked "interrupted") | Re-submitted after restart |
| Queue backpressure | None | asyncio.Queue provides natural backpressure |

### What didn't change

- **Workflow failure recovery**: a failed workflow still marks itself `"failed"` in
  MongoDB.  There is no automatic retry.  The recruiter must submit a new request.
- **Single Ollama server**: Ollama itself is still a single-threaded inference server.
  `MAX_CONCURRENT_WORKFLOWS = 2` means two workflows may hold an Ollama connection
  simultaneously, but each call inside a workflow is still sequential.
- **In-process only**: `_task_queue` lives in memory.  A sudden process kill (SIGKILL)
  can lose queued-but-not-yet-started tasks.  They are safe in MongoDB with
  `status="queued"` and will be re-submitted on the next restart via `rehydrate_tasks`.
- **No dead-letter queue**: persistent handler failures still have no retry limit.

### Failure modes

| Failure | Outcome |
|---|---|
| Dispatcher CancelledError (shutdown) | Clean exit; loop breaks, running workflows finish |
| Dispatcher unexpected exception | Logged; loop continues (doesn't crash the dispatcher) |
| Workflow exception | `status="failed"` written to MongoDB; semaphore released |
| Ollama unavailable | Workflow uses regex fallback (already implemented in agents) |
| Process killed mid-workflow | Task stays `"running"` in MongoDB → marked `"interrupted"` on next restart |

---

## 6. Limitations

1. **MAX_CONCURRENT_WORKFLOWS is a compile-time constant** (set to 2).  There is no
   API to adjust it at runtime.  For a demo this is fine; a production system would
   read it from config.

2. **Single process only**: the queue and semaphore live in the FastAPI process.
   Running multiple uvicorn worker processes (e.g. `--workers 4`) would give each
   process its own independent queue and semaphore — tasks would not be shared across
   workers.  For the current single-worker deployment this is not an issue.

3. **No queue persistence across hard crashes**: if the process is killed with SIGKILL
   while tasks are waiting in `_task_queue` (but before their MongoDB status is
   updated to `"running"`), those tasks remain `"queued"` in MongoDB and are
   re-submitted by `rehydrate_tasks` on the next start.  This is correct behavior.

4. **`"running"` tasks on restart are interrupted, not retried**: a workflow that was
   mid-flight cannot be resumed from where it left off.  The recruiter must re-submit.
   Adding checkpoint-based resumption would require persisting intermediate results
   per step in MongoDB — feasible but out of scope for this change.

5. **WebSocket connections do not survive restart**: this was true before and remains
   true.  After a restart, the frontend's auto-reconnect logic (up to 5 retries at 2s
   intervals) re-opens the WebSocket and receives the current task state from MongoDB.

---

## 7. Demo Instructions

### Starting the platform

```bash
docker compose up -d          # MongoDB, MySQL, Redis, Kafka, Ollama
cd backend && uvicorn main:app --reload --port 8000
```

### Submitting tasks

```bash
# Submit 3 tasks simultaneously — 2 will start, 1 will queue
curl -s -X POST http://localhost:8000/ai/analyze-candidates \
     -H 'Content-Type: application/json' -d '{"job_id": 1, "top_n": 3}'
curl -s -X POST http://localhost:8000/ai/analyze-candidates \
     -H 'Content-Type: application/json' -d '{"job_id": 2, "top_n": 3}'
curl -s -X POST http://localhost:8000/ai/analyze-candidates \
     -H 'Content-Type: application/json' -d '{"job_id": 3, "top_n": 3}'
```

### Observing the queue

```bash
# See queue depth and active slot count
curl -s http://localhost:8000/ai/queue-status | python -m json.tool
# Expected output (with 2 running, 1 waiting):
# { "queued": 1, "active": 2, "max_concurrent": 2, "available_slots": 0 }
```

### Tracking a task

```bash
curl -s -X POST http://localhost:8000/ai/task-status \
     -H 'Content-Type: application/json' \
     -d '{"task_id": "<task_id_from_above>"}'
```

Status progression: `queued` → `running` (fetch_data → parse_resumes → …) →
`awaiting_approval`

### WebSocket live updates (frontend)

The AI Dashboard in the frontend connects to `ws://localhost:5173/ai/ws/<task_id>`
automatically.  The progress bar and step timeline update in real time as the
dispatcher starts the task and each workflow step completes.

### Demonstrating restart recovery

```bash
# Submit a task, then immediately restart the server before it starts
curl -s -X POST http://localhost:8000/ai/analyze-candidates \
     -H 'Content-Type: application/json' -d '{"job_id": 1, "top_n": 3}'
# Ctrl+C the uvicorn process
uvicorn main:app --reload --port 8000
# Check logs — task will be re-queued and run normally:
# [rehydrate] re-queued task <id> (job_id=1, top_n=3)
# [dispatcher] starting workflow <id>…
```
