# Setup and Runbook

**LinkedIn Agentic AI Platform** -- DATA236 / San Jose State University

This document consolidates all operational instructions: setup, seeding, testing,
AI workflows, analytics, performance benchmarking, Kubernetes deployment, and a
step-by-step demo-day runbook.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Docker Setup (Full Stack)](#2-docker-setup-full-stack)
3. [Local Development Setup](#3-local-development-setup)
4. [Seeding the Database](#4-seeding-the-database)
5. [Dataset Loading (Kaggle)](#5-dataset-loading-kaggle)
6. [AI Workflow Usage](#6-ai-workflow-usage)
7. [AI Evaluation Scripts](#7-ai-evaluation-scripts)
8. [Analytics Usage](#8-analytics-usage)
9. [Performance and Load Testing](#9-performance-and-load-testing)
10. [Running the Test Suite](#10-running-the-test-suite)
11. [AWS / Kubernetes Deployment](#11-aws--kubernetes-deployment)
12. [Demo-Day Runbook](#12-demo-day-runbook)
13. [Troubleshooting](#13-troubleshooting)
14. [Known Limitations](#14-known-limitations)

---

## 1. Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Docker Desktop | 4.x+ | Compose v2 with `depends_on` health conditions |
| Python | 3.11 | Only needed for local dev (Docker handles it otherwise) |
| Node.js | 20+ | Only needed for frontend local dev |
| Git | any | For cloning the repository |
| Free ports | 3306, 5173, 6379, 8000, 9092, 9094, 11434, 27018 | All used by Docker services |
| Disk space | ~4 GB | Docker images + Ollama model |

---

## 2. Docker Setup (Full Stack)

This starts all seven services (MySQL, MongoDB, Redis, Kafka, Ollama, backend, frontend) with one command.

### First-time setup

```bash
# 1. Clone
git clone https://github.com/Akashkumarsenthil/Linkedin.git
cd Linkedin

# 2. Build and start
docker compose up -d --build

# 3. Wait for MySQL to be healthy (~20 s on first boot)
docker compose ps   # all services should show "running"

# 4. Pull the Ollama model (one-time, ~2 GB)
docker exec linkedin-ollama ollama pull llama3.2

# 5. Seed the database
docker exec linkedin-backend python seed_data.py --quick --yes

# 6. Verify
curl http://localhost:8000/health
```

### Subsequent starts

```bash
docker compose up -d
```

### Stop / reset

```bash
docker compose down          # stop all containers
docker compose down -v       # stop + wipe all data volumes (clean slate)
```

### Service URLs

| Service | URL |
|---------|-----|
| React frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| Swagger UI | http://localhost:8000/docs |
| ReDoc | http://localhost:8000/redoc |
| Ollama | http://localhost:11434 |

---

## 3. Local Development Setup

Use this when you want live code reloading while editing the backend or frontend.

### Step 1 -- Start infrastructure only

```bash
docker compose up -d mysql mongodb redis kafka ollama
docker exec linkedin-ollama ollama pull llama3.2   # one-time
```

### Step 2 -- Configure and run the backend

```bash
cp .env.example backend/.env

cd backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Key environment variables in `.env.example`:

| Variable | Default | Note |
|----------|---------|------|
| `MYSQL_HOST` | `localhost` | MySQL mapped to :3306 |
| `MONGO_PORT` | `27018` | Avoids clash with any local mongod on :27017 |
| `REDIS_HOST` | `localhost` | Redis mapped to :6379 |
| `KAFKA_BOOTSTRAP_SERVERS` | `localhost:9094` | External listener for outside-Docker clients |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama mapped to :11434 |

On successful startup you will see:

```
✓ Kafka producer connected
✓ Kafka consumer started
✓ MongoDB indexes ensured
✓ AI task rehydration complete (0 task(s) restored)
✓ All services ready
  Swagger UI:  http://localhost:8000/docs
```

### Step 3 -- Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The Vite dev server proxies `/api` to `:8000`.

---

## 4. Seeding the Database

The seed script (`backend/seed_data.py`) generates realistic synthetic data using Faker.

### Quick seed (demos and testing)

```bash
# Docker
docker exec linkedin-backend python seed_data.py --quick --yes

# Local
cd backend && python seed_data.py --quick --yes
```

| Entity | Quick | Full |
|--------|------:|-----:|
| Members | 60 | 10,000 |
| Recruiters | 6 | 10,000 |
| Job postings | 50 | 10,000 |
| Applications | 120 | 15,000 |
| Saved jobs | 40 | 5,000 |
| Message threads | 12 | 2,000 |
| Profile view records | 80 | 30,000 |

### Full seed (load testing and analytics)

```bash
docker exec linkedin-backend python seed_data.py --yes
```

Takes ~3-5 minutes.

> **Note:** Running the seed script on a non-empty database will fail on duplicate
> email constraints. Wipe first: `docker compose down -v && docker compose up -d --build`

---

## 5. Dataset Loading (Kaggle)

Two loader scripts replace synthetic data with real Kaggle datasets. CSV files are
**not committed** to the repo; the loaders print download instructions if files are absent.

### Download the datasets

| File to create | Source |
|----------------|--------|
| `data/linkedin_job_postings.csv` | [arshkon/linkedin-job-postings](https://www.kaggle.com/datasets/arshkon/linkedin-job-postings) (~33k rows) |
| `data/resume_dataset.csv` | [snehaanbhawal/resume-dataset](https://www.kaggle.com/datasets/snehaanbhawal/resume-dataset) (~2,484 rows) |

See `data/README.md` for expected columns and download steps.

### Load jobs

```bash
cd backend

# Load all rows (~33k), keep existing jobs
python scripts/load_kaggle_jobs.py

# Load first 10,000 rows, replace synthetic jobs first
python scripts/load_kaggle_jobs.py --limit 10000 --clear
```

**Real fields:** title, description, location, salary, seniority, skills, views, applies.
**Synthetic fields:** company_id, recruiter_id, work_mode, status.

### Load resumes

```bash
# Option A: Create new members from resumes
python scripts/load_kaggle_resumes.py --mode seed

# Option B: Patch existing members' resume_text (recommended after seed_data.py)
python scripts/load_kaggle_resumes.py --mode patch --limit 10000
```

### Recommended full-scale demo flow

```bash
python seed_data.py --yes                                    # 10k synthetic base
python scripts/load_kaggle_jobs.py --limit 10000 --clear     # real job data
python scripts/load_kaggle_resumes.py --mode patch --limit 10000  # real resumes
```

> **Important:** Always seed recruiters first. The jobs loader assigns random
> `recruiter_id` values; loading jobs before recruiters causes FK violations.

---

## 6. AI Workflow Usage

The AI layer follows a **supervisor agent pattern**: one orchestrator
(`hiring_assistant.py`) coordinates three skills with a mandatory human review step.

### Start a hiring workflow

```bash
curl -s -X POST http://localhost:8000/ai/analyze-candidates \
  -H "Content-Type: application/json" \
  -d '{"job_id": 1, "top_n": 5}' | python3 -m json.tool
```

Note the `task_id` from the response.

### Poll status

```bash
TASK_ID="<paste here>"
curl -s -X POST http://localhost:8000/ai/task-status \
  -H "Content-Type: application/json" \
  -d "{\"task_id\": \"$TASK_ID\"}" | python3 -m json.tool
```

Or stream via WebSocket: `ws://localhost:8000/ai/ws/{task_id}`

### Approve or reject

```bash
curl -s -X POST http://localhost:8000/ai/approve \
  -H "Content-Type: application/json" \
  -d "{\"task_id\": \"$TASK_ID\", \"approved\": true, \"feedback\": \"Looks good\"}" \
  | python3 -m json.tool
```

### Task states

```
queued -> running -> awaiting_approval -> approved / rejected
       -> failed
       -> interrupted  (server restart while running)
```

### Restart recovery

Task state is persisted to MongoDB at every step transition:

- **`awaiting_approval`** tasks are reloaded into memory on restart -- approval works
- **`queued`/`running`** tasks are marked `interrupted` -- the recruiter must re-trigger

### Standalone AI endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /ai/parse-resume` | Parse a resume (Ollama or regex fallback) |
| `POST /ai/match` | Score a candidate against a job |
| `POST /ai/tasks/list` | List all active/recent tasks |

### Ollama model options

| Model | Size | Notes |
|-------|------|-------|
| `llama3.2` | ~2 GB | Default; good quality, ~30-60 s per resume on CPU |
| `smollm2` | ~250 MB | Faster; slightly lower output quality |

All AI skills have complete fallbacks (regex/templates). The API always returns
valid JSON even without Ollama running.

---

## 7. AI Evaluation Scripts

The evaluation script (`backend/scripts/ai_evaluation.py`) measures two metrics
required by the class brief.

### Matching quality (Precision@K, NDCG@K, MRR)

Evaluates whether the job-candidate matcher produces shortlists where top-ranked
candidates have relevant skills. Uses skills overlap as ground truth.

```bash
# Prerequisites: Docker services running, data seeded
docker compose up -d
cd backend && python seed_data.py --quick --yes

# Run evaluation
python scripts/ai_evaluation.py --matching

# Customise
python scripts/ai_evaluation.py --matching --sample-jobs 50 --candidates 50 --top-k 10
```

**Interpretation:**

| Score range | Meaning |
|-------------|---------|
| Precision@K >= 0.80 | At least 4/5 shortlisted candidates have genuine skills overlap |
| NDCG@K >= 0.70 | Higher-overlap candidates consistently ranked above lower-overlap |
| MRR >= 0.50 | A strong candidate appears in the top 2 positions on average |

### HITL effectiveness (approval rate, feedback categories)

Reads real `approved`/`rejected` task documents from MongoDB.

```bash
# Start backend
uvicorn main:app --reload &

# Run 3 workflows and approve/reject them (see below)
curl -s -X POST http://localhost:8000/ai/analyze-candidates \
  -H 'Content-Type: application/json' \
  -d '{"job_id": 1, "top_n": 5}'
# Wait for awaiting_approval, then approve:
curl -s -X POST http://localhost:8000/ai/approve \
  -H 'Content-Type: application/json' \
  -d '{"task_id": "TASK_ID_HERE", "approved": true, "feedback": ""}'

# Run the HITL evaluation
python scripts/ai_evaluation.py --hitl
```

### JSON output (for automated consumption)

```bash
python scripts/ai_evaluation.py --json > evaluation_results.json
```

---

## 8. Analytics Usage

### Recruiter/Admin dashboard (5 required graphs)

| Chart | Endpoint | Data source |
|-------|----------|-------------|
| Top 10 jobs by applications/month | `POST /analytics/jobs/top-monthly` | MySQL |
| City-wise applications/month | `POST /analytics/geo/monthly` | MySQL |
| Bottom 5 jobs (fewest applications) | `POST /analytics/jobs/least-applied` | MySQL |
| Clicks per job (from logs) | `POST /analytics/jobs/clicks` | MongoDB event_logs |
| Saved jobs per day/week | `POST /analytics/saves/trend` | MySQL |

### General analytics

| Chart | Endpoint | Frontend component |
|-------|----------|--------------------|
| Top jobs by metric | `POST /analytics/jobs/top` | `TopJobsChart.tsx` |
| Application funnel | `POST /analytics/funnel` | `FunnelChart.tsx` |
| Geo distribution | `POST /analytics/geo` | `GeoTable.tsx` |
| Member dashboard | `POST /analytics/member/dashboard` | `MemberDashboard.tsx` |

### Generating click events for the "clicks per job" chart

Click events are generated when jobs are viewed through the API. With freshly
seeded data (no API views yet), the chart will be empty. To generate events:

```bash
# View several jobs through the API
for i in 1 2 3 4 5; do
  curl -s -X POST http://localhost:8000/jobs/get \
    -H 'Content-Type: application/json' \
    -d "{\"job_id\": $i}" > /dev/null
done
```

Then load the clicks chart in the Analytics tab.

---

## 9. Performance and Load Testing

### 9.1 Locust load tests

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
mkdir -p load_tests/results
locust -f load_tests/locustfile.py \
  --host http://localhost:8000 \
  --users 20 --spawn-rate 2 --run-time 60s \
  --headless \
  --html load_tests/results/report.html \
  --csv  load_tests/results/summary
```

**Endpoints tested:**

| Endpoint | Weight | User class |
|----------|--------|-----------|
| `POST /jobs/search` | 4 | ReadUser (70%) |
| `POST /members/search` | 3 | ReadUser |
| `POST /jobs/get` | 2 | ReadUser |
| `POST /members/get` | 1 | ReadUser |
| `POST /applications/submit` | 3 | WriteUser (30%) |

> Before running, update `MEMBER_ID_MAX` and `JOB_ID_MAX` in `locustfile.py` to
> match your seed dataset (60/50 for quick, 10000/10000 for full).

### 9.2 Redis cache benchmark

Measures cold (MySQL) vs warm (Redis) latency:

```bash
cd backend
python cache_benchmark.py --member-id 1 --repeats 10
```

Typical results on local Docker:

| Endpoint | Cold (MySQL) | Warm (Redis) | Speedup |
|----------|-------------|-------------|---------|
| `/members/get` | 5-20 ms | 1-3 ms | 5-15x |
| `/members/search` | 15-80 ms | 1-3 ms | 10-40x |
| `/jobs/search` | 15-80 ms | 1-3 ms | 10-40x |

### 9.3 Four-mode performance comparison

The `load_tests/perf_comparison.py` script benchmarks four progressive optimisation
modes across two scenarios (reads and writes):

| Mode | What's active | Key difference |
|------|---------------|----------------|
| **B** (Base) | MySQL + Redis flushed | Cold cache; progressive warming |
| **B+S** | MySQL + Redis pre-warmed | Most reads served from Redis |
| **B+S+K** | + Kafka publishing | Write path includes `send_and_wait()` |
| **B+S+K+O** | + MongoDB indexes + connection pooling | Full optimisation stack |

**Live mode** (requires Docker stack running):

```bash
cd load_tests
python perf_comparison.py
python perf_comparison.py --json > results.json
```

**Sample mode** (generates synthetic results without Docker):

```bash
python perf_comparison.py --sample --json > results.json
```

**Generate charts from results:**

```bash
python generate_charts.py results.json
# Produces 5 PNGs in load_tests/results/
```

See `REQUIRED_PERFORMANCE_COMPARISON_REPORT.md` for full methodology, mode
definitions, and interpretation guide.

---

## 10. Running the Test Suite

All tests are integration tests requiring the Docker stack.

```bash
# Run all tests
docker exec linkedin-backend pytest tests/ -m integration -v

# Local dev (venv active, stack running)
cd backend && pytest tests/ -m integration -v
```

### Test inventory

**`tests/test_api.py`** -- 9 tests (API smoke + AI persistence):

| Test | What it verifies |
|------|-----------------|
| `test_root` | `GET /` returns `status: running` |
| `test_health` | All services healthy including MongoDB |
| `test_jobs_search` | Search returns paginated results |
| `test_members_search` | Member search returns results |
| `test_ai_parse_resume_fallback` | Resume parser works without Ollama |
| `test_ai_task_status_unknown` | Unknown task_id returns `success: false` |
| `test_ai_tasks_list_shape` | Task list endpoint returns a list |
| `test_ai_task_persisted_and_survives_cache_eviction` | Task queryable from MongoDB after cache eviction |
| `test_ai_task_rehydration` | `rehydrate_tasks()` restores/interrupts correctly |

**`tests/test_reliability.py`** -- 7 tests (failure modes):

| Test | Failure mode |
|------|-------------|
| `test_duplicate_member_email` | Duplicate email blocked, DB count = 1 |
| `test_duplicate_recruiter_email` | Same for recruiters |
| `test_duplicate_application` | Same (job, member) pair blocked |
| `test_apply_to_closed_job` | Closed job blocked, 0 application rows |
| `test_message_send_success_and_db_state` | Happy path baseline |
| `test_message_send_retry_exhausted` | 3 retries fail, 3 rollbacks, 0 rows |
| `test_kafka_consumer_idempotency` | Same event twice, handler called once |

### Verifying AI task restart recovery manually

1. Start a workflow: `POST /ai/analyze-candidates {"job_id": 1, "top_n": 3}`
2. Wait for `awaiting_approval` status
3. Kill the server: `docker compose restart backend`
4. Restart and check logs for: `AI task rehydration complete (1 task(s) restored)`
5. Confirm task status is still queryable
6. Approve the task -- it should succeed

---

## 11. AWS / Kubernetes Deployment

The `k8s/` directory contains 12 Kubernetes manifests for deploying to EKS or any
conformant cluster.

### Files

| Manifest | Resource | Notes |
|----------|----------|-------|
| `namespace.yaml` | `linkedin-platform` namespace | |
| `configmap.yaml` | Non-secret env vars | Uses K8s DNS names (mysql, mongodb, etc.) |
| `secrets.yaml` | Base64-encoded dev passwords | Replace for production |
| `mysql.yaml` | PVC (10 GiB gp2) + Deployment + Service | Recreate strategy |
| `mongodb.yaml` | PVC (5 GiB) + Deployment + Service | |
| `redis.yaml` | Deployment + Service | No PVC (cache is ephemeral) |
| `kafka.yaml` | PVC (5 GiB) + KRaft Deployment + Service | No Zookeeper |
| `ollama.yaml` | PVC (10 GiB) + Deployment + Service | 2 GiB memory request |
| `backend.yaml` | 2 replicas, envFrom configMap + secret | Health probe on /health |
| `frontend.yaml` | 2 replicas | Port 5173 -> 80 |
| `ingress.yaml` | ALB Ingress with path-based routing | Requires AWS LB Controller |
| `deploy.sh` | Applies manifests in dependency order | |

### Deploying

```bash
# Prerequisites:
# 1. kubectl configured for your EKS cluster
# 2. Backend and frontend images pushed to ECR
# 3. AWS Load Balancer Controller installed

cd k8s
chmod +x deploy.sh
./deploy.sh                    # deploy everything
./deploy.sh --dry-run=client   # preview without applying
```

### Post-deploy

```bash
kubectl -n linkedin-platform get pods
kubectl -n linkedin-platform get ingress          # get ALB URL
kubectl -n linkedin-platform logs deploy/backend
kubectl -n linkedin-platform exec deploy/backend -- python seed_data.py --quick --yes
kubectl -n linkedin-platform exec deploy/ollama -- ollama pull llama3.2
```

### Image preparation

Before deploying, build and push images to ECR:

```bash
# Backend
docker build -t <account>.dkr.ecr.<region>.amazonaws.com/linkedin-backend:latest ./backend
docker push <account>.dkr.ecr.<region>.amazonaws.com/linkedin-backend:latest

# Frontend (set VITE_API_URL to ALB DNS)
docker build --build-arg VITE_API_URL=http://<alb-dns> \
  -t <account>.dkr.ecr.<region>.amazonaws.com/linkedin-frontend:latest ./frontend
docker push <account>.dkr.ecr.<region>.amazonaws.com/linkedin-frontend:latest
```

Update the `image:` fields in `backend.yaml` and `frontend.yaml` to match.

### ALB Ingress routing

| Path | Backend |
|------|---------|
| `/jobs`, `/members`, `/applications`, `/recruiters`, `/messages`, `/connections`, `/analytics`, `/ai`, `/health`, `/docs`, `/openapi.json` | backend:8000 |
| `/` (default) | frontend:80 |

### What is NOT automated

- ECR repository creation, IAM roles, VPC/subnet setup
- AWS Load Balancer Controller installation
- TLS certificate (commented-out ACM annotation in `ingress.yaml`)
- The deployment has not been tested on a live EKS cluster

---

## 12. Demo-Day Runbook

Suggested order for a 10-15 minute demonstration.

### Setup (before the audience arrives)

```bash
docker compose up -d --build
docker exec linkedin-ollama ollama pull llama3.2   # skip if already pulled
docker exec linkedin-backend python seed_data.py --quick --yes
```

Verify: http://localhost:8000/health shows all services healthy.

### Step 1 -- Health dashboard (1 min)

Open http://localhost:5173 -> **Overview** tab -> click **Refresh health**.
Point out all four services (API, Redis, MongoDB, Kafka) are healthy.

### Step 2 -- Job and member search with caching (2 min)

**Jobs tab** -> search "engineer" -> show the job listing.

Then run the cache benchmark:

```bash
docker exec linkedin-backend python cache_benchmark.py --member-id 1 --repeats 5
```

Show cold (MySQL) vs warm (Redis) latency.

### Step 3 -- Application submission and Kafka event (2 min)

In Swagger (`http://localhost:8000/docs`) -> `POST /applications/submit`:

```json
{ "job_id": 1, "member_id": 1 }
```

Then check `/analytics/jobs/top` to show the count increased via the Kafka consumer.

### Step 4 -- Analytics charts (1 min)

Open **Analytics** tab:
- **Top Jobs** -> Load chart -> toggle Applications / Views / Saves
- **Funnel** -> job_id `1` -> views -> saves -> applies with conversion rates
- **Geo** -> job_id `1` -> city/state distribution
- **Member Dashboard** -> member_id `1` -> profile views + application status

### Step 5 -- Messaging (1 min)

**Messages** tab -> set identity to member `1` -> open new thread with member `2` -> send message -> switch to member `2` -> reply.

### Step 6 -- Connections (1 min)

**Connections** tab -> set identity to member `3` -> send request to `4` -> copy `connection_id` -> accept -> load "My connections".

### Step 7 -- AI hiring workflow (4 min)

```bash
curl -s -X POST http://localhost:8000/ai/analyze-candidates \
  -H "Content-Type: application/json" \
  -d '{"job_id": 1, "top_n": 3}' | python3 -m json.tool
```

Poll status, explain the 5 steps (fetch, parse, score, outreach, await approval).
When `awaiting_approval`, show the result and approve it.

### Step 8 -- Test suite (1 min)

```bash
docker exec linkedin-backend pytest tests/ -m integration -v
```

Show 16 tests passing.

---

## 13. Troubleshooting

### MySQL not ready on first boot

MySQL healthcheck may pass before the `linkedin` user/database is fully provisioned.

```bash
docker exec linkedin-mysql mysqladmin -u linkedin_user -plinkedin_pass ping
```

If it fails, wait 10s and retry. The backend retries on first request.

### Kafka connection errors on startup

Kafka has no healthcheck; the backend may connect before the broker is ready.
aiokafka retries internally. If errors persist:

```bash
docker compose restart backend
```

### Seed script fails with duplicate email

The database already has data. Wipe and restart:

```bash
docker compose down -v && docker compose up -d --build
```

### Ollama is slow / timing out

CPU-only inference takes 30-60s per resume. Options:
- Use a smaller model: `docker exec linkedin-ollama ollama pull smollm2`, then set `OLLAMA_MODEL=smollm2` in the backend environment
- The AI endpoints always fall back to regex/templates on timeout (5s)

### Frontend shows "Network Error"

- Check that the backend is running: `curl http://localhost:8000/health`
- In Docker mode, the frontend JS calls `http://127.0.0.1:8000` (baked in at build time). If the backend port changed, rebuild: `docker compose build frontend`

### Redis cache not working

```bash
docker exec linkedin-redis redis-cli ping    # should return PONG
docker exec linkedin-redis redis-cli DBSIZE  # should show cached keys after requests
```

### MongoDB connection fails

```bash
docker exec linkedin-mongodb mongosh \
  -u mongo_user -p mongo_pass --authenticationDatabase admin \
  linkedin --eval "db.agent_tasks.countDocuments({})"
```

### Load test shows all failures

Ensure the backend is running and data is seeded. Update `MEMBER_ID_MAX`/`JOB_ID_MAX`
in `locustfile.py` to match your seed counts.

---

## 14. Known Limitations

| Area | Limitation | Detail |
|------|-----------|--------|
| **Auth** | No authentication | No user login or JWT. Demo UI exposes `user_id` fields directly. |
| **Ollama** | Manual model pull | `docker compose up` cannot auto-pull the model. Run `docker exec linkedin-ollama ollama pull llama3.2` once. |
| **Ollama** | CPU-only inference | 30-60s per resume. Agents have a 5s timeout with regex/template fallback. |
| **Connections** | No pending-requests endpoint | `/connections/list` returns accepted only. Accept/reject requires knowing the `connection_id`. |
| **Messages** | Not real-time | Messages fetched on demand (manual refresh). WebSocket exists for AI tasks only. |
| **CORS** | Fully open | `allow_origins=["*"]` for development. Must be restricted for production. |
| **Scaling** | Single Uvicorn worker | Default runs one process. Use `--workers 4` for scale testing. |
| **Kafka** | Auto-created topics | First few events may log warnings on cold start. No data is lost. |
| **Frontend** | Bundle size | Recharts adds ~200 KB gzipped. Vite warns about chunk size. |
| **Seed** | Full seed takes 2-3 min | Use `--quick` for demos. |
| **K8s** | Not tested on live EKS | Manifests are complete but have not been applied to a real cluster. |
| **AI tasks** | In-memory cache per worker | Multiple Uvicorn workers have separate caches; all queries fall through to MongoDB. |
| **Kaggle data** | Manual download | Loaders print instructions but do not call the Kaggle API. |
| **Resume dataset** | ~2,484 rows | Fewer than the 10k member target. Remaining members keep synthetic resume text. |
