<p align="center">
  <img src="https://img.shields.io/badge/Python-3.9+-3776AB?style=for-the-badge&logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi&logoColor=white" />
  <img src="https://img.shields.io/badge/MySQL-8.0-4479A1?style=for-the-badge&logo=mysql&logoColor=white" />
  <img src="https://img.shields.io/badge/MongoDB-7.0-47A248?style=for-the-badge&logo=mongodb&logoColor=white" />
  <img src="https://img.shields.io/badge/Redis-7.0-DC382D?style=for-the-badge&logo=redis&logoColor=white" />
  <img src="https://img.shields.io/badge/Kafka-3.7-231F20?style=for-the-badge&logo=apachekafka&logoColor=white" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white" />
</p>

<h1 align="center">🔗 LinkedIn Agentic AI Platform</h1>

<p align="center">
  <em>DATA236 · San Jose State University</em>
</p>

---

## What is this?

We built a LinkedIn-style platform from scratch — not just a simple CRUD app, but a properly distributed system with event streaming, caching, and an AI layer that can actually parse resumes and match candidates to jobs.

The backend is a **FastAPI** monolith with clean service boundaries, talking to **MySQL** for relational data, **MongoDB** for event logs and AI traces, **Redis** for caching, and **Apache Kafka** for async event processing. On top of all that, we added an AI agent powered by a local **Ollama** LLM that handles the hiring workflow end-to-end — from parsing a resume to generating outreach messages for recruiters.

There's also a small **React** frontend to exercise the APIs, but the real meat is in the backend and infrastructure.

---

## What's inside

| Layer | What it does |
|-------|-------------|
| **REST API** | 8 services — members, recruiters, jobs, applications, messages, connections, analytics, AI agents |
| **MySQL** | All the transactional stuff — profiles, job postings, applications, messages |
| **MongoDB** | Event logs, Kafka consumer deduplication, AI agent traces |
| **Redis** | Caches search results and member profiles so we're not hammering MySQL |
| **Kafka** | Every important action fires an event — `job.created`, `application.submitted`, etc. |
| **Ollama** | Local LLM for resume parsing and candidate matching. Falls back to regex if Ollama isn't running |
| **React Frontend** | Health dashboard, job/member search, AI parse demo |

---

## How it all fits together

```
┌─────────────┐     HTTP      ┌──────────────────────────────────────────────┐
│  React UI   │ ────────────► │  FastAPI Backend                              │
│  (Vite)     │   /api proxy  │                                              │
└─────────────┘               │  ┌────────┐ ┌────────┐ ┌────────┐ ┌───────┐ │
                              │  │Members │ │ Jobs   │ │  Apps  │ │ Msgs  │ │
                              │  └────────┘ └────────┘ └────────┘ └───────┘ │
                              │  ┌────────┐ ┌────────┐ ┌──────────────────┐ │
                              │  │Connect.│ │Analyt. │ │   AI Agents      │ │
                              │  └────────┘ └────────┘ └──────────────────┘ │
                              │                                              │
                              │  MySQL ◄──► Redis cache                     │
                              │  Mongo ◄── event logs, dedup state          │
                              │  Kafka ◄── producer + background consumer   │
                              └──────────────────────────────────────────────┘
                                       ▲
                                       │ optional
                                  ┌────┴────┐
                                  │ Ollama  │  localhost:11434
                                  └─────────┘
```

---

## Tech stack

### Backend

| What | Why we picked it |
|------|-----------------|
| **Python 3.9+ / FastAPI** | Async, fast, and auto-generates Swagger docs out of the box |
| **SQLAlchemy 2** | Solid ORM with connection pooling — handles MySQL well |
| **Pydantic v2** | Request validation that also generates great OpenAPI examples |
| **aiokafka** | Async Kafka producer/consumer that plays nice with FastAPI's event loop |
| **Motor** | Async MongoDB driver — needed for non-blocking event log writes |
| **redis-py** | Simple caching layer with JSON serialization |
| **httpx** | Async HTTP client for talking to Ollama |
| **Faker** | Generates realistic test data — names, emails, skills, company names |

### Infrastructure

| What | Version | Role |
|------|---------|------|
| **MySQL** | 8.0 | Main database for all relational entities |
| **MongoDB** | 7.0 | Event logs + Kafka consumer idempotency tracking |
| **Redis** | 7 (Alpine) | Query caching — keeps search results warm |
| **Apache Kafka** | 3.7 (KRaft) | Event streaming — no Zookeeper needed |
| **Docker Compose** | v2 | Spins up all 4 services with one command |

### AI

| What | Role |
|------|------|
| **Ollama** | Runs LLMs locally (we used llama3.2) |
| **Resume Parser** | Pulls out skills, experience, education from raw text |
| **Job Matcher** | Scores candidates — 50% skills, 20% location, 30% seniority |
| **Outreach Generator** | Writes personalized recruiter messages |

### Frontend

| What | Role |
|------|------|
| **React 19 + Vite** | Quick dev server, proxies API calls to FastAPI |
| **TypeScript** | Type safety in the frontend |

---

## Project structure

```
Linkedin/
├── docker-compose.yml              # All infrastructure in one file
├── .env.example                     # Copy this to backend/.env
│
├── backend/
│   ├── main.py                      # Entry point — registers all routers
│   ├── config.py                    # Reads settings from .env
│   ├── database.py                  # MySQL + MongoDB connections
│   ├── cache.py                     # Redis caching
│   ├── kafka_producer.py            # Publishes events to Kafka
│   ├── kafka_consumer.py            # Consumes events (with dedup)
│   ├── requirements.txt             # pip dependencies
│   ├── seed_data.py                 # Fills the DB with fake data
│   │
│   ├── models/                      # SQLAlchemy ORM
│   ├── schemas/                     # Pydantic request/response models
│   ├── routers/                     # 8 API service handlers
│   ├── agents/                      # AI skills + orchestrator
│   ├── db/init.sql                  # MySQL schema (Docker loads this)
│   └── tests/                       # Integration tests
│
├── frontend/                        # React + Vite
├── postman/                         # Postman collection + environment
└── docs/openapi.json                # Static OpenAPI spec
```

---

## Getting started

### You'll need

- **Docker Desktop** — [get it here](https://docs.docker.com/get-docker/)
- **Python 3.9+** — [download](https://www.python.org/downloads/)
- **Node.js 18+** — [download](https://nodejs.org/)
- *(Optional)* **[Ollama](https://ollama.com/)** — only if you want the AI to use a real LLM instead of regex

---

### 1. Clone it

```bash
git clone https://github.com/Akashkumarsenthil/Linkedin.git
cd Linkedin
```

### 2. Start the infrastructure

```bash
docker compose up -d
```

This brings up MySQL, MongoDB, Redis, and Kafka. Wait until MySQL says "healthy":

```bash
docker compose ps
```

> **First time?** MySQL will automatically create all tables from `backend/db/init.sql`. If you ever want a clean slate, run `docker compose down -v` to wipe the volumes.

### 3. Set up your environment

```bash
cp .env.example backend/.env
```

The defaults work with the Docker Compose file. Here's what matters:

| Variable | Default | Notes |
|----------|---------|-------|
| `MYSQL_*` | `localhost:3306`, user `linkedin_user` | Matches docker-compose |
| `MONGO_PORT` | `27017` | Change to `27018` if you already have MongoDB running locally |
| `KAFKA_BOOTSTRAP_SERVERS` | `localhost:9094` | This is the external listener port |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Only matters if Ollama is installed |

### 4. Install Python dependencies

```bash
cd backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 5. Seed the database

For a quick test dataset (~500 records):

```bash
python seed_data.py --quick --yes
```

For the full dataset (10K+ members, jobs, applications, connections):

```bash
python seed_data.py --yes
```

### 6. Start the backend

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

You should see something like this:

```
============================================================
  LinkedIn Agentic AI Platform v1.0.0
============================================================
✓ Kafka producer connected
✓ Kafka consumer started
✓ All services ready
  Swagger UI:  http://localhost:8000/docs
  ReDoc:       http://localhost:8000/redoc
============================================================
```

### 7. Start the frontend

```bash
cd ../frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The dev server proxies `/api` calls to the backend.

---

## API docs

**Best way to explore the API:** Open [http://localhost:8000/docs](http://localhost:8000/docs) while the server is running. FastAPI generates interactive Swagger docs from all the Pydantic schemas. You can try every endpoint right in the browser.

### Postman

We have a full Postman collection with **45+ requests** — happy paths, error cases, the whole thing:

1. Open Postman
2. Import `postman/LinkedIn_Platform_API.postman_collection.json`
3. Import `postman/Local.postman_environment.json`
4. Select the **Local** environment
5. Start testing

### All the endpoints

| Service | Routes | What they do |
|---------|--------|-------------|
| **Members** | `/members/create`, `get`, `update`, `delete`, `search` | Profile CRUD + search by keyword, skill, or location |
| **Recruiters** | `/recruiters/create`, `get`, `update`, `delete` | Recruiter account management |
| **Jobs** | `/jobs/create`, `get`, `update`, `search`, `close`, `save`, `byRecruiter` | Full job posting lifecycle |
| **Applications** | `/applications/submit`, `get`, `byJob`, `byMember`, `updateStatus`, `addNote` | Application workflow with status tracking |
| **Messaging** | `/threads/open`, `get`, `byUser` + `/messages/send`, `list` | Threaded messaging system |
| **Connections** | `/connections/request`, `accept`, `reject`, `list`, `mutual` | LinkedIn-style connections |
| **Analytics** | `/events/ingest` + `/analytics/jobs/top`, `funnel`, `geo`, `member/dashboard` | Event tracking and dashboards |
| **AI Agents** | `/ai/parse-resume`, `match`, `analyze-candidates`, `task-status`, `approve` | The whole AI workflow |

---

## How the AI agent works

The AI system follows a supervisor pattern — one orchestrator coordinating three specialized skills, with a human checking the output before anything goes out:

```
Recruiter kicks off analysis
        │
        ▼
┌───────────────┐     ┌──────────────┐     ┌──────────────┐
│ Resume Parser │ ──► │  Job Matcher │ ──► │   Outreach   │
│ (Ollama or    │     │  (weighted   │     │  Generator   │
│  regex)       │     │   scoring)   │     │  (LLM or     │
└───────────────┘     └──────────────┘     │   template)  │
                                            └──────┬───────┘
                                                   │
                                                   ▼
                                          Recruiter reviews
                                          and approves/rejects
```

**The flow:**

1. Hit `POST /ai/analyze-candidates` with a job ID
2. The Hiring Assistant grabs all candidates and runs them through the pipeline
3. Resume Parser extracts structured data from each resume
4. Job Matcher scores them — skills overlap counts for 50%, location for 20%, seniority for 30%
5. Top candidates get personalized outreach drafts
6. Everything goes to `POST /ai/approve` where a recruiter approves or rejects

**No Ollama installed?** Totally fine. Every AI skill has a built-in fallback — regex for parsing, pure math for matching, templates for outreach. The API always returns a valid response.

You can also connect via WebSocket at `/ai/ws/{task_id}` for real-time progress updates.

---

## Running tests

With Docker running and your `.env` set up:

```bash
cd backend
source venv/bin/activate
pytest tests/ -m integration -v
```

---

## Quick sanity check

After starting the server, try these:

```bash
# Health check
curl http://localhost:8000/health

# Search for jobs
curl -X POST http://localhost:8000/jobs/search \
  -H "Content-Type: application/json" \
  -d '{"keyword": "engineer", "page": 1, "page_size": 5}'

# Parse a resume (works without Ollama)
curl -X POST http://localhost:8000/ai/parse-resume \
  -H "Content-Type: application/json" \
  -d '{"resume_text": "Jane Smith | Senior SWE | 6 years Python Java AWS Docker"}'
```

---

## Things we ran into (and how we fixed them)

### MongoDB kept saying "Authentication failed"

The docker container creates the root user in the `admin` database, but our code was trying to authenticate against the `linkedin` database. We had to add `?authSource=admin` to the connection URL in `config.py`. Took us a while to figure that one out.

### The Kafka image we wanted didn't exist

We originally planned to use `bitnami/kafka:3.7` but it wasn't available on Docker Hub. Switched to the official `apache/kafka:3.7.0` image instead. The environment variables are slightly different between the two, so we had to adjust the docker-compose config.

### Kafka consumer would hang for 45+ seconds on restart

When the server crashed or was killed abruptly, the consumer would sit there waiting for the old session to expire before it could rejoin the group. We fixed it by setting aggressive timeouts — `session_timeout_ms=10000` and `heartbeat_interval_ms=3000`.

### Port 27017 was already taken

If you have MongoDB installed locally, it's probably already using port 27017. Our Docker container would bind to the same port and either fail or your app would connect to the wrong instance. We documented this in the setup — just change the published port to 27018 in docker-compose.yml.

### AI endpoints were slow without Ollama

The resume parser was waiting a full 60 seconds for Ollama to respond before falling back to regex. We dropped the timeout to 5 seconds so the fallback kicks in almost instantly. Users don't even notice the difference.

### SQLAlchemy logs "ROLLBACK" on every request

This looks scary in the logs but it's completely normal. When you do a read-only query and close the session without calling `commit()`, SQLAlchemy cleans up with a `ROLLBACK`. No data is lost.

---

## Kafka events

Every meaningful action publishes an event to Kafka. They all follow the same format:

```json
{
  "event_type": "application.submitted",
  "trace_id": "uuid",
  "timestamp": "2026-04-02T21:30:00Z",
  "actor_id": "42",
  "entity": { "entity_type": "application", "entity_id": "123" },
  "payload": { "job_id": 1, "member_id": 42 },
  "idempotency_key": "uuid"
}
```

| Topic | When it fires |
|-------|--------------|
| `job.created` | New job posted |
| `job.viewed` | Someone looks at a job |
| `job.saved` | Someone saves a job |
| `job.closed` | Recruiter closes a posting |
| `application.submitted` | New application comes in |
| `application.statusChanged` | Status moves (reviewing → interview → offer) |
| `message.sent` | New message in a thread |
| `connection.requested` | Someone sends a connection request |
| `connection.accepted` | Connection gets accepted |
| `ai.requests` | AI workflow starts |
| `ai.results` | AI workflow completes a step |

---

## A few notes

- **CORS** is wide open for development. You'd want to lock that down before deploying anywhere real.
- **Kafka consumer** runs inside the API process, which is fine for a class project. In production you'd split it into separate workers.
- **`.env` files** are gitignored. Always copy from `.env.example`.
- Set `DEBUG=False` in your `.env` to turn off SQLAlchemy query logging — makes the logs much cleaner.

---

## Team

Built for **DATA236** at **San Jose State University**.

---

<p align="center">
  <em>If the README and the code disagree, trust the code — and fix both in the same commit.</em>
</p>
