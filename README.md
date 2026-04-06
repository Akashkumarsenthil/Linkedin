<p align="center">
  <img src="https://img.shields.io/badge/Python-3.11-3776AB?style=for-the-badge&logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi&logoColor=white" />
  <img src="https://img.shields.io/badge/MySQL-8.0-4479A1?style=for-the-badge&logo=mysql&logoColor=white" />
  <img src="https://img.shields.io/badge/MongoDB-7.0-47A248?style=for-the-badge&logo=mongodb&logoColor=white" />
  <img src="https://img.shields.io/badge/Redis-7.0-DC382D?style=for-the-badge&logo=redis&logoColor=white" />
  <img src="https://img.shields.io/badge/Kafka-3.7-231F20?style=for-the-badge&logo=apachekafka&logoColor=white" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white" />
</p>

<h1 align="center">LinkedIn Agentic AI Platform</h1>

<p align="center"><em>DATA236 · San Jose State University</em></p>

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Service and Module Breakdown](#4-service-and-module-breakdown)
5. [API Documentation](#5-api-documentation)
6. [Running with Docker (recommended)](#6-running-with-docker-recommended)
7. [Seeding the Database](#7-seeding-the-database)
8. [Local Development Setup](#8-local-development-setup)
9. [AI Workflow and Ollama](#9-ai-workflow-and-ollama)
10. [Kafka Topics and Async Processing](#10-kafka-topics-and-async-processing)
11. [Analytics Features](#11-analytics-features)
12. [Testing](#12-testing)
13. [Performance and Load Testing](#13-performance-and-load-testing)
14. [MongoDB Indexes](#14-mongodb-indexes)
15. [Known Limitations](#15-known-limitations)
16. [Demo Day Flow](#16-demo-day-flow)

---

## 1. Project Overview

This is a LinkedIn-style professional networking platform built as a distributed system for the DATA236 course at San Jose State University. The project goes well beyond a basic CRUD app — it integrates event streaming, multi-layer caching, agentic AI workflows, and a live analytics dashboard.

**What the system can do:**

- Full member and recruiter profile management with search
- Job postings with application workflow and status tracking
- Threaded messaging between members and recruiters
- LinkedIn-style connection requests, acceptance, and mutual-connection lookup
- Real-time event streaming via Kafka (every meaningful action publishes an event)
- Redis caching for search results and profile lookups (5–20× speedup demonstrated)
- MongoDB-persisted AI agent traces and event logs
- An agentic AI hiring workflow that parses resumes, scores candidates, generates outreach drafts, and waits for human approval before proceeding
- Live analytics charts: top jobs, application funnel, geo distribution, member dashboards
- A React demo console that exercises all of the above

The backend is a FastAPI monolith with clean service boundaries. The infrastructure runs entirely in Docker Compose with one command.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        React Frontend (Vite)                      │
│   Overview · Jobs · Members · Analytics · Messages · Connections  │
│                         AI Tools                                  │
└─────────────────────────────┬────────────────────────────────────┘
                              │ HTTP (dev: Vite proxy /api → :8000)
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                      FastAPI Backend (:8000)                      │
│                                                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ Members  │ │   Jobs   │ │  Apps    │ │ Messages │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │Recruiters│ │Connections│ │Analytics │ │ AI Agent │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Kafka Producer  ──►  Kafka Broker  ◄──  Kafka Consumer     │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────┬──────────┬──────────┬──────────────────────┬─────────────┘
       │          │          │                       │
       ▼          ▼          ▼                       ▼
  ┌────────┐  ┌────────┐ ┌────────┐          ┌────────────┐
  │ MySQL  │  │MongoDB │ │ Redis  │          │   Ollama   │
  │ :3306  │  │ :27018 │ │ :6379  │          │  :11434    │
  │        │  │        │ │        │          │ (local LLM)│
  │Profiles│  │Events  │ │Cache   │          └────────────┘
  │Jobs    │  │Traces  │ │Search  │
  │Apps    │  │AI tasks│ │Profiles│
  │Threads │  │Dedup   │ │        │
  └────────┘  └────────┘ └────────┘
```

**Data flow summary:**

| Data type | Primary store | Why |
|-----------|--------------|-----|
| Profiles, jobs, applications, messages, connections | MySQL | Relational, ACID transactions needed |
| Event logs, AI agent traces, Kafka deduplication | MongoDB | Unstructured, write-heavy, schema-flexible |
| Search result caches, profile caches | Redis | Sub-millisecond reads, auto-expiry |
| Async domain events | Kafka | Decoupled processing, durable log |

---

## 3. Tech Stack

### Backend

| Component | Version | Purpose |
|-----------|---------|---------|
| Python | 3.11 | Runtime |
| FastAPI | 0.115 | Async REST framework; auto-generates Swagger and ReDoc |
| SQLAlchemy | 2.x | ORM for MySQL with connection pooling |
| Pydantic | v2 | Request validation and OpenAPI schema generation |
| Motor | 3.6 | Async MongoDB driver (needed for non-blocking writes) |
| aiokafka | 0.11 | Async Kafka producer and consumer |
| redis-py | 5.1 | Sync Redis client for the caching layer |
| httpx | 0.27 | Async HTTP client for Ollama API calls |
| Faker | 30.x | Realistic synthetic data generation |

### Infrastructure

| Service | Version | Role |
|---------|---------|------|
| MySQL | 8.0 | Transactional relational data |
| MongoDB | 7.0 | Event logs, AI traces, idempotency records |
| Redis | 7.0 (Alpine) | Query result and profile caching |
| Apache Kafka | 3.7 (KRaft) | Async event streaming — no Zookeeper |
| Ollama | latest | Local LLM inference (llama3.2) |
| Docker Compose | v2 | Full-stack orchestration |

### Frontend

| Component | Version | Purpose |
|-----------|---------|---------|
| React | 19 | UI framework |
| Vite | 8 | Build tool and dev server |
| TypeScript | 5.9 | Type safety |
| Recharts | 3.x | Analytics charts (bar, line, pie) |

---

## 4. Service and Module Breakdown

### Repository layout

```
Linkedin/
├── docker-compose.yml              # Full infrastructure definition
├── .env.example                    # Copy to backend/.env for local dev
│
├── backend/
│   ├── main.py                     # FastAPI app entry point; lifespan startup
│   ├── config.py                   # Environment variable settings
│   ├── database.py                 # MySQL + MongoDB connections; index creation
│   ├── cache.py                    # Redis cache wrapper
│   ├── kafka_producer.py           # Event publisher (standardised envelope)
│   ├── kafka_consumer.py           # Background consumer with idempotency
│   ├── seed_data.py                # Synthetic data generator (quick / full profiles)
│   ├── cache_benchmark.py          # Redis cold vs warm latency benchmark
│   ├── requirements.txt
│   │
│   ├── models/                     # SQLAlchemy ORM models
│   │   ├── member.py               # Member, ProfileViewDaily
│   │   ├── recruiter.py
│   │   ├── job.py                  # JobPosting, SavedJob
│   │   ├── application.py
│   │   ├── message.py              # Thread, ThreadParticipant, Message
│   │   └── connection.py
│   │
│   ├── schemas/                    # Pydantic request/response models
│   │
│   ├── routers/                    # One file per service
│   │   ├── members.py
│   │   ├── recruiters.py
│   │   ├── jobs.py
│   │   ├── applications.py
│   │   ├── messages.py
│   │   ├── connections.py
│   │   ├── analytics.py
│   │   └── ai_service.py
│   │
│   ├── agents/                     # AI skills and orchestrator
│   │   ├── hiring_assistant.py     # Supervisor: orchestrates the full workflow
│   │   ├── resume_parser.py        # Skill 1: extract structured data from resume text
│   │   ├── job_matcher.py          # Skill 2: weighted candidate scoring
│   │   └── outreach_generator.py   # Skill 3: personalised recruiter message drafts
│   │
│   ├── db/init.sql                 # MySQL DDL (loaded automatically by Docker)
│   │
│   └── tests/
│       ├── conftest.py
│       ├── test_api.py             # 9 integration tests (health, search, AI persistence)
│       └── test_reliability.py     # 7 reliability tests (duplicates, retries, idempotency)
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx                 # Tab routing and panel wiring
│   │   ├── api.ts                  # fetch wrappers (apiGet / apiPost)
│   │   └── components/
│   │       ├── TopJobsChart.tsx    # Recharts horizontal bar; metric toggle
│   │       ├── FunnelChart.tsx     # Views → Saves → Applies with conversion rates
│   │       ├── GeoTable.tsx        # Applicant geography table with inline bars
│   │       ├── MemberDashboard.tsx # Profile-views line chart + status pie chart
│   │       ├── MessagingPanel.tsx  # Thread list, message view, compose
│   │       └── ConnectionsPanel.tsx# Send/accept/reject requests, list, mutual
│   └── package.json
│
├── load_tests/
│   ├── locustfile.py               # Locust load test (ReadUser + WriteUser)
│   ├── cache_benchmark.py          # Standalone cold/warm comparison (load_tests copy)
│   └── requirements.txt
│
├── postman/
│   ├── LinkedIn_Platform_API.postman_collection.json
│   └── Local.postman_environment.json
│
└── docs/
    └── openapi.json                # Static OpenAPI 3.x spec
```

### Backend services

| Service | Routes | Key behaviour |
|---------|--------|---------------|
| **Members** | `/members/create`, `get`, `update`, `delete`, `search` | Duplicate-email guard; Redis caches profiles (TTL 300 s) and search results (TTL 60 s); cache invalidated on write |
| **Recruiters** | `/recruiters/create`, `get`, `update`, `delete` | Duplicate-email guard; Redis cache (TTL 300 s) |
| **Jobs** | `/jobs/create`, `get`, `update`, `search`, `close`, `save`, `byRecruiter` | Redis caches search (TTL 60 s) and individual jobs (TTL 300 s); `job.viewed` Kafka event on GET |
| **Applications** | `/applications/submit`, `get`, `byJob`, `byMember`, `updateStatus`, `addNote` | Application-layer duplicate check; closed-job check; 3-retry loop on DB insert with rollback |
| **Messaging** | `/threads/open`, `get`, `byUser` + `/messages/send`, `list` | Thread participants stored per user_id + user_type (member/recruiter); messages newest-first |
| **Connections** | `/connections/request`, `accept`, `reject`, `list`, `mutual` | Bidirectional duplicate check; rejected connections can be re-requested; `/list` returns accepted only, enriched with member name and headline |
| **Analytics** | `/events/ingest`, `/analytics/jobs/top`, `funnel`, `geo`, `member/dashboard` | SQL aggregates over MySQL; event ingestion writes to MongoDB + Kafka |
| **AI Agents** | `/ai/parse-resume`, `match`, `analyze-candidates`, `task-status`, `approve`, `tasks/list` + WebSocket `/ai/ws/{task_id}` | Full hiring workflow; MongoDB is source of truth for task state; startup rehydration restores `awaiting_approval` tasks |

---

## 5. API Documentation

**Interactive (best for exploration):**  
Open http://localhost:8000/docs while the server is running. Every endpoint has example request bodies and response schemas generated from the Pydantic models.

ReDoc (read-only, better for printing): http://localhost:8000/redoc

**Static spec:**  
`docs/openapi.json` — importable into Postman, Insomnia, or any OpenAPI tool.

**Postman collection (45+ requests):**

```
postman/LinkedIn_Platform_API.postman_collection.json
postman/Local.postman_environment.json
```

Import both files into Postman, select the **Local** environment, and every request is pre-configured.

---

## 6. Running with Docker (recommended)

This mode starts all seven services — MySQL, MongoDB, Redis, Kafka, Ollama, the FastAPI backend, and the React frontend — with a single command. No local Python or Node.js installation required.

### Prerequisites

- **Docker Desktop 4.x+** — [https://docs.docker.com/get-docker/](https://docs.docker.com/get-docker/)
- ~4 GB free disk space (images + Ollama model)

### Step 1 — Clone

```bash
git clone https://github.com/Akashkumarsenthil/Linkedin.git
cd Linkedin
```

### Step 2 — Build and start

```bash
docker compose up -d --build
```

The first run builds the backend and frontend images (3–5 minutes). Subsequent starts are fast because layers are cached.

> **MySQL initialisation:** On first start, Docker automatically runs `backend/db/init.sql` to create all tables. To reset to a clean state: `docker compose down -v`

### Step 3 — Pull the Ollama model (one-time, ~2 GB)

```bash
docker exec linkedin-ollama ollama pull llama3.2
```

This downloads the model into the persistent `ollama_data` volume. It only needs to be run once. **Without this step, all AI endpoints still work but use regex/template fallbacks instead of the LLM.**

To use a lighter model (faster inference, slightly lower quality):

```bash
docker exec linkedin-ollama ollama pull smollm2
# then set OLLAMA_MODEL=smollm2 in backend/.env and restart
```

### Step 4 — Verify

```bash
docker compose ps              # all services should show "running"
curl http://localhost:8000/health
```

Expected health response:
```json
{"status": "healthy", "services": {"api": true, "redis": true, "kafka_producer": true, "mongodb": true}}
```

### Service URLs

| Service | URL |
|---------|-----|
| **React frontend** | http://localhost:5173 |
| **Backend API** | http://localhost:8000 |
| **Swagger UI** | http://localhost:8000/docs |
| **ReDoc** | http://localhost:8000/redoc |
| **Ollama** | http://localhost:11434 |

---

## 7. Seeding the Database

The seed script generates realistic synthetic data using Faker. Run it after starting the stack.

### Quick seed — for demos and testing

```bash
# Docker
docker exec linkedin-backend python seed_data.py --quick --yes

# Local dev (venv active)
cd backend && python seed_data.py --quick --yes
```

| Entity | Quick count |
|--------|------------|
| Members | 60 |
| Recruiters | 6 |
| Job postings | 50 |
| Applications | 120 |
| Connections | — |
| Messages | — |
| Profile view records | — |

Takes ~10 seconds.

### Full seed — for realistic load testing and analytics

```bash
# Docker
docker exec linkedin-backend python seed_data.py --yes

# Local dev
python seed_data.py --yes
```

| Entity | Full count | Quick count (`--quick`) |
|--------|-----------|------------------------|
| Members | 10,000 | 60 |
| Recruiters | **10,000** | 6 |
| Job postings | 10,000 | 50 |
| Applications | 15,000 | 120 |
| Saved jobs | 5,000 | 40 |
| Message threads | 2,000 | 12 |
| Profile view records | 30,000 | 80 |

Full seed takes ~3–5 minutes.

### Dataset loaders (optional — real Kaggle data)

After seeding, you can replace synthetic data with real Kaggle datasets.
See [`data/README.md`](data/README.md) for download links and expected filenames.

```bash
cd backend

# Replace synthetic jobs with real LinkedIn Job Postings 2023
python scripts/load_kaggle_jobs.py --limit 10000 --clear

# Upgrade member resume_text with real Resume Dataset text
python scripts/load_kaggle_resumes.py --mode patch --limit 10000
```

See [`SETUP_AND_RUNBOOK.md`](SETUP_AND_RUNBOOK.md#5-dataset-loading-kaggle) for full
dataset loading instructions and pipeline details.

> **Note:** Running the seed script a second time on a non-empty database will fail on duplicate email constraints. Run `docker compose down -v && docker compose up -d` first if you want a clean slate.

---

## 8. Local Development Setup

Use this when you want live code reloading while editing the backend or frontend.

### Step 1 — Start only the infrastructure

```bash
docker compose up -d mysql mongodb redis kafka ollama
```

### Step 2 — Configure the backend

```bash
cp .env.example backend/.env
```

The defaults in `.env.example` work as-is for the Docker-mapped ports:

| Variable | Default | Note |
|----------|---------|------|
| `MYSQL_HOST` | `localhost` | MySQL mapped to :3306 |
| `MONGO_PORT` | `27018` | Avoids clash with any local mongod on :27017 |
| `REDIS_HOST` | `localhost` | Redis mapped to :6379 |
| `KAFKA_BOOTSTRAP_SERVERS` | `localhost:9094` | External listener for outside-Docker clients |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama mapped to :11434 |

### Step 3 — Run the backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

On startup you will see:
```
✓ Kafka producer connected
✓ Kafka consumer started
✓ MongoDB indexes ensured
✓ AI task rehydration complete (0 task(s) restored)
✓ All services ready
  Swagger UI:  http://localhost:8000/docs
```

### Step 4 — Seed

```bash
python seed_data.py --quick --yes
```

### Step 5 — Run the frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` → `http://127.0.0.1:8000` in dev mode.

Open http://localhost:5173.

---

## 9. AI Workflow and Ollama

### Overview

The AI layer follows a **supervisor agent pattern**: one orchestrator (`hiring_assistant.py`) coordinates three specialised skills, with a mandatory human review step before any action is taken.

```
POST /ai/analyze-candidates  { job_id: 1, top_n: 5 }
        │
        │  returns task_id immediately (async)
        ▼
┌───────────────────────────────────────────────────────┐
│  run_hiring_workflow (background asyncio task)         │
│                                                        │
│  Step 1: Fetch job + candidates from MySQL             │
│                                                        │
│  Step 2: Resume Parser ──► for each candidate         │
│          Ollama prompt → structured JSON               │
│          Fallback: regex + keyword extraction          │
│                                                        │
│  Step 3: Job Matcher ──► score each candidate         │
│          Skills overlap  50 %                          │
│          Location match  20 %                          │
│          Seniority match 30 %                          │
│                                                        │
│  Step 4: Outreach Generator ──► top N candidates      │
│          Ollama prompt → personalised message          │
│          Fallback: fill-in template                    │
│                                                        │
│  Step 5: Save result to MongoDB, set status            │
│          = "awaiting_approval"                         │
└───────────────────────────────────────────────────────┘
        │
        │  Poll: POST /ai/task-status  { task_id }
        │  Stream: ws://localhost:8000/ai/ws/{task_id}
        ▼
POST /ai/approve  { task_id, approved: true, feedback: "…" }
```

### Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /ai/analyze-candidates` | Start a hiring workflow; returns `task_id` |
| `POST /ai/task-status` | Check status of any task (cache → MongoDB fallback) |
| `POST /ai/tasks/list` | List all active/recent tasks |
| `POST /ai/approve` | Approve or reject AI output (HITL gate) |
| `POST /ai/parse-resume` | Standalone resume parsing (Ollama or regex) |
| `POST /ai/match` | Standalone job–candidate matching |
| `WS /ai/ws/{task_id}` | Real-time status stream |

### Task states

```
queued → running → awaiting_approval → approved
                                     → rejected
       → failed
       → interrupted  (server restart while running)
```

### Persistence and restart recovery

Task state is persisted to MongoDB `agent_tasks` collection at every step transition. On server restart:

- Tasks in `awaiting_approval` state are reloaded into memory — approval still works
- Tasks in `queued` or `running` state are marked `interrupted` — the recruiter must re-trigger

This means a server restart does not silently lose completed-but-unapproved results.

### Ollama model requirements

| Model | Size | Notes |
|-------|------|-------|
| `llama3.2` | ~2 GB | Default; good quality, ~30–60 s per resume on CPU |
| `smollm2` | ~250 MB | Faster; slightly lower output quality |

All three AI skills have **complete fallbacks** — regex for parsing, pure math for matching, string templates for outreach. The API always returns valid JSON even without Ollama running.

---

## 10. Kafka Topics and Async Processing

### Event envelope format

Every Kafka message follows this structure:

```json
{
  "event_type": "application.submitted",
  "trace_id":   "550e8400-e29b-41d4-a716-446655440000",
  "timestamp":  "2026-04-03T10:00:00Z",
  "actor_id":   "42",
  "entity":     { "entity_type": "application", "entity_id": "123" },
  "payload":    { "job_id": 1, "member_id": 42 },
  "idempotency_key": "550e8400-…"
}
```

### Topics

| Topic | Fired by | Consumed action |
|-------|----------|----------------|
| `job.created` | `POST /jobs/create` | Logged to MongoDB |
| `job.viewed` | `POST /jobs/get` | Increments `views_count` in MySQL |
| `job.saved` | `POST /jobs/save` | Logged to MongoDB |
| `job.closed` | `POST /jobs/close` | Logged to MongoDB |
| `application.submitted` | `POST /applications/submit` | Increments `applicants_count` in MySQL |
| `application.statusChanged` | `POST /applications/updateStatus` | Logged to MongoDB |
| `message.sent` | `POST /messages/send` | Logged to MongoDB |
| `connection.requested` | `POST /connections/request` | Logged to MongoDB |
| `connection.accepted` | `POST /connections/accept` | Logged to MongoDB |
| `ai.requests` | `POST /ai/analyze-candidates` | Logged to MongoDB |
| `ai.results` | Each AI workflow step | Logged to MongoDB |

### Idempotency

The consumer implements **two-layer deduplication**:

1. In-memory `processed_keys` set — fast path, per process
2. MongoDB `processed_events` collection (indexed on `idempotency_key`) — persists across restarts

If a message is delivered twice (Kafka at-least-once guarantee), the handler runs exactly once.

### Kafka configuration

The broker runs in KRaft mode (no Zookeeper). Two listeners are configured:

| Listener | Address | Used by |
|----------|---------|---------|
| `PLAINTEXT` | `kafka:9092` | Backend container (inter-container) |
| `EXTERNAL` | `localhost:9094` | Local development (outside Docker) |

---

## 11. Analytics Features

### Backend endpoints

| Endpoint | What it returns |
|----------|----------------|
| `POST /analytics/jobs/top` | Top N job postings by `applications`, `views`, or `saves` within a configurable lookback window |
| `POST /analytics/funnel` | For a specific job: views → saves → applications with conversion rates |
| `POST /analytics/geo` | City/state distribution of applicants for a specific job |
| `POST /analytics/member/dashboard` | 30-day profile view history + application status breakdown for a member |
| `POST /events/ingest` | Write a custom tracking event to MongoDB + Kafka |

### Frontend charts (Analytics tab)

All charts are in `frontend/src/components/` and are built with Recharts:

| Component | Chart type | Endpoint |
|-----------|-----------|---------|
| `TopJobsChart` | Horizontal bar; metric toggle (applications/views/saves) | `/analytics/jobs/top` |
| `FunnelChart` | Vertical bars with conversion rate strip | `/analytics/funnel` |
| `GeoTable` | Table with proportional inline bars | `/analytics/geo` |
| `MemberDashboard` | Line chart (profile views) + pie chart (application statuses) | `/analytics/member/dashboard` |

Charts load on demand and show an empty-state message if the database has no seed data.

---

## 12. Testing

All tests are integration tests — they require the full Docker stack running.

### Run all tests

```bash
# Docker
docker exec linkedin-backend pytest tests/ -m integration -v

# Local dev (venv active, stack running)
cd backend
pytest tests/ -m integration -v
```

### Test inventory

**`tests/test_api.py`** — API smoke and AI persistence (9 tests)

| Test | What it verifies |
|------|----------------|
| `test_root` | `GET /` returns `status: running` |
| `test_health` | All services healthy including MongoDB |
| `test_jobs_search` | Search returns paginated results |
| `test_members_search` | Member search returns results |
| `test_ai_parse_resume_fallback` | Resume parser works without Ollama |
| `test_ai_task_status_unknown` | Unknown task_id returns `success: false` without 500 |
| `test_ai_tasks_list_shape` | Task list endpoint returns a list |
| `test_ai_task_persisted_and_survives_cache_eviction` | Task queryable from MongoDB after in-memory eviction |
| `test_ai_task_rehydration` | `rehydrate_tasks()` loads `awaiting_approval`, marks `running` as `interrupted` |

**`tests/test_reliability.py`** — Failure mode coverage (7 tests)

| Test | Failure mode covered |
|------|---------------------|
| `test_duplicate_member_email` | Duplicate email → `success: false`, DB count = 1 |
| `test_duplicate_recruiter_email` | Same for recruiters |
| `test_duplicate_application` | Same (job_id, member_id) pair → `success: false`, DB count = 1 |
| `test_apply_to_closed_job` | Closed job → `success: false`, 0 application rows |
| `test_message_send_success_and_db_state` | Happy path → exactly 1 Message row in DB |
| `test_message_send_retry_exhausted` | All 3 retries fail → `success: false`, 3 rollbacks, 0 rows |
| `test_kafka_consumer_idempotency` | Same event twice → handler called once |

---

## 13. Performance and Load Testing

### Locust load tests

Requires `locust` installed in the load test environment:

```bash
pip install -r load_tests/requirements.txt
```

**Web UI mode (recommended for demo):**

```bash
locust -f load_tests/locustfile.py --host http://localhost:8000
# Open http://localhost:8089
# Set: users=20, spawn_rate=2, run_time=60s
```

**Headless mode:**

```bash
locust -f load_tests/locustfile.py \
  --host http://localhost:8000 \
  --users 20 --spawn-rate 2 --run-time 60s \
  --headless \
  --html load_tests/results/report.html \
  --csv  load_tests/results/summary
```

**Endpoints tested and user mix:**

| Endpoint | Weight | User class |
|----------|--------|-----------|
| `POST /jobs/search` | 4 | ReadUser (70 %) |
| `POST /members/search` | 3 | ReadUser |
| `POST /jobs/get` | 2 | ReadUser |
| `POST /members/get` | 1 | ReadUser |
| `POST /applications/submit` | 3 | WriteUser (30 %) |

Before running load tests, update `MEMBER_ID_MAX` and `JOB_ID_MAX` in `locustfile.py` to match your seed dataset (`60`/`50` for quick, `10000`/`10000` for full).

### Redis cache benchmark

Measures the latency difference between a cache miss (MySQL) and cache hit (Redis) for three endpoints:

```bash
# From backend/ with venv active
python cache_benchmark.py --member-id 1 --repeats 10
```

Benchmarks `POST /members/get`, `POST /members/search`, and `POST /jobs/search`. Outputs per-request timings, median/p95 stats, and a speedup ratio.

Typical results on a local Docker setup:

| Endpoint | Cold (MySQL) | Warm (Redis) | Speedup |
|----------|-------------|-------------|---------|
| `/members/get` | 5–20 ms | 1–3 ms | 5–15× |
| `/members/search` | 15–80 ms | 1–3 ms | 10–40× |
| `/jobs/search` | 15–80 ms | 1–3 ms | 10–40× |

> Actual numbers vary by machine. Run the benchmark and substitute your results in the final report.

Full documentation: [`SETUP_AND_RUNBOOK.md`](SETUP_AND_RUNBOOK.md#9-performance-and-load-testing)

---

## 14. MongoDB Indexes

Indexes are created automatically at server startup via `create_mongo_indexes()` in `database.py`. The call is idempotent — restarting the server never rebuilds existing indexes.

| Collection | Field | Type | Justification |
|------------|-------|------|--------------|
| `agent_tasks` | `task_id` | Unique | Every `find_one`/`update_one` in the hiring assistant filters on this field |
| `agent_tasks` | `status` | Regular | `rehydrate_tasks()` queries `{status: {$in: [...]}}` on every startup |
| `processed_events` | `idempotency_key` | Unique | Called for every Kafka message; critical hot path |
| `event_logs` | `event_type` | Regular | Future analytics filtering |
| `event_logs` | `timestamp` | Ascending | Time-range queries on event logs |
| `agent_traces` | `task_id` | Regular | Debugging: fetch all traces for a workflow run |

Full documentation: [`SETUP_AND_RUNBOOK.md`](SETUP_AND_RUNBOOK.md#92-redis-cache-benchmark)

---

## 15. Known Limitations

| Limitation | Detail |
|------------|--------|
| **Ollama model pull is manual** | `docker compose up` starts the Ollama container but cannot auto-pull the model (~2 GB). Run `docker exec linkedin-ollama ollama pull llama3.2` once. Without it, AI endpoints use regex/template fallbacks — they still return valid responses. |
| **CPU-only Ollama inference** | The container runs without GPU passthrough by default. Inference takes 30–60 s per resume on typical hardware. For a live demo, pull a smaller model (`smollm2`) or pre-run the workflow and demo the approval step. |
| **No authentication or session system** | There is no user login or JWT/session management. The demo UI exposes `user_id` fields directly. The messaging and connections panels require you to declare your identity manually. This is by design for a course project; production would require an auth layer. |
| **No list-pending-connections endpoint** | `/connections/list` returns accepted connections only. To accept/reject a request, users must copy the `connection_id` from the send-request response. A "pending inbox" endpoint is not implemented. |
| **CORS is fully open** | `allow_origins=["*"]` is set for development. This must be restricted before any public deployment. |
| **Single Uvicorn worker** | The default startup runs one process. For horizontal scale testing, use `uvicorn --workers 4` (note: this creates per-process `active_tasks` caches; all status queries fall through to MongoDB correctly due to the async fallback). |
| **Kafka topics are auto-created** | Topic creation happens on first publish. On a cold start, the first few Kafka events may log a warning if the broker isn't fully ready. The backend continues; no data is lost. |
| **Frontend messages are not real-time** | Messages and connection status are fetched on demand (manual refresh). WebSocket support exists for AI tasks only; it is not wired to the messaging system. |
| **Full seed takes 2–3 minutes** | The seeder uses bulk inserts but MySQL still takes time for 10k+ rows. Use the quick seed for demos. |

---

## 16. Demo Day Flow

Suggested order for a 10–15 minute demonstration. The full Docker stack should be running with the quick seed loaded.

### Setup (before the audience arrives)

```bash
docker compose up -d --build
docker exec linkedin-ollama ollama pull llama3.2   # skip if already pulled
docker exec linkedin-backend python seed_data.py --quick --yes
```

Verify: http://localhost:8000/health shows all services healthy.

---

### Step 1 — Show the health dashboard (1 min)

Open http://localhost:5173 → **Overview** tab → click **Refresh health**.

Point out: all four services (API, Redis, MongoDB, Kafka) are healthy.

---

### Step 2 — Job and member search with caching (2 min)

**Jobs tab** → search "engineer" → show the job listing.

Then open a terminal and run the cache benchmark:

```bash
docker exec linkedin-backend python cache_benchmark.py --member-id 1 --repeats 5
```

Show the cold (MySQL) vs warm (Redis) latency — typically 5–15× faster on cache hit.

---

### Step 3 — Application submission and Kafka event (2 min)

In Swagger (http://localhost:8000/docs) → `POST /applications/submit`:

```json
{ "job_id": 1, "member_id": 1 }
```

Then run:

```json
POST /analytics/jobs/top  { "metric": "applications", "limit": 5, "window_days": 365 }
```

Show that job #1's application count increased — this is driven by the Kafka `application.submitted` consumer updating MySQL asynchronously.

---

### Step 4 — Analytics charts (1 min)

Open **Analytics** tab in the UI.

- **Top Jobs** → click "Load chart" → switch between Applications / Views / Saves
- **Funnel** → enter job_id `1` → show views → saves → applies with conversion rates
- **Geo** → enter job_id `1` → show city/state applicant distribution
- **Member Dashboard** → enter member_id `1` → show 30-day profile views + application status breakdown

---

### Step 5 — Messaging (1 min)

**Messages** tab → set identity to member `1` → click ↺ to load threads.

Open a new thread: participant `2`, subject "Demo conversation" → type a message → Send.

Switch identity to member `2` → load threads → select the thread → reply.

---

### Step 6 — Connections (1 min)

**Connections** tab → set identity to member `3` → Send Request to member `4`.

Copy the `connection_id` from the result → Accept the connection.

Load "My connections" → member 4 appears.

---

### Step 7 — AI hiring workflow (4 min, the main event)

**In terminal or Swagger:**

```bash
curl -s -X POST http://localhost:8000/ai/analyze-candidates \
  -H "Content-Type: application/json" \
  -d '{"job_id": 1, "top_n": 3}' | python3 -m json.tool
```

Note the `task_id`.

Poll status (or open the WebSocket):

```bash
TASK_ID="<paste here>"
watch -n 3 "curl -s -X POST http://localhost:8000/ai/task-status \
  -H 'Content-Type: application/json' \
  -d '{\"task_id\": \"'$TASK_ID'\"}' | python3 -m json.tool"
```

While the workflow runs, explain the steps:
1. Fetches job requirements and candidates
2. Parses each resume (Ollama or regex fallback)
3. Scores candidates by skills/location/seniority
4. Generates personalised outreach drafts for the top 3

When status reaches `awaiting_approval`, show the full result (shortlist + drafts), then approve:

```bash
curl -s -X POST http://localhost:8000/ai/approve \
  -H "Content-Type: application/json" \
  -d "{\"task_id\": \"$TASK_ID\", \"approved\": true, \"feedback\": \"Looks great\"}" \
  | python3 -m json.tool
```

---

### Step 8 — Run the test suite (1 min)

```bash
docker exec linkedin-backend pytest tests/ -m integration -v
```

Show 16 tests passing — covering health, search, AI persistence, duplicates, retries, and Kafka idempotency.

---

## Quick sanity checks

```bash
# Health
curl http://localhost:8000/health

# Search jobs
curl -s -X POST http://localhost:8000/jobs/search \
  -H "Content-Type: application/json" \
  -d '{"keyword": "engineer", "page": 1, "page_size": 5}' | python3 -m json.tool

# Parse a resume (works without Ollama)
curl -s -X POST http://localhost:8000/ai/parse-resume \
  -H "Content-Type: application/json" \
  -d '{"resume_text": "Jane Smith | ML Engineer | Python PyTorch Spark AWS 5 years"}' \
  | python3 -m json.tool
```

---

## Additional Documentation

| Document | Contents |
|----------|---------|
| [`SETUP_AND_RUNBOOK.md`](SETUP_AND_RUNBOOK.md) | Comprehensive setup, seeding, dataset loading, AI evaluation, performance benchmarking, K8s deployment, demo-day runbook, troubleshooting |
| [`REQUIRED_PERFORMANCE_COMPARISON_REPORT.md`](REQUIRED_PERFORMANCE_COMPARISON_REPORT.md) | Four-mode performance comparison methodology and results |
| [`FINAL_REQUIREMENTS_ALIGNMENT_REPORT.md`](FINAL_REQUIREMENTS_ALIGNMENT_REPORT.md) | Evidence-driven audit of every class requirement against actual code |

---

## Notes for evaluators

- **CORS** is set to `allow_origins=["*"]` for development. This must be restricted before any public deployment.
- **Kafka consumer** runs inside the API process — appropriate for a class project, not for production workloads.
- `.env` files are gitignored. Copy `.env.example` to `backend/.env` for local dev.
- Set `DEBUG=False` in `.env` to suppress SQLAlchemy query logging in the server output.
- The `ROLLBACK` lines you see in logs on read-only requests are normal SQLAlchemy session cleanup — no data is being rolled back.

---

<p align="center">
  Built for <strong>DATA236</strong> · San Jose State University
</p>

<p align="center">
  <em>If the README and the code disagree, trust the code — and fix the README.</em>
</p>
