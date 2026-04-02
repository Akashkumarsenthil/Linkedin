# LinkedIn Agentic AI Platform

Course-style project: a **FastAPI** backend that models LinkedIn-like domains (members, recruiters, jobs, applications, messaging, connections, analytics) plus **agentic AI** helpers (resume parsing, job matching, hiring workflows). Data lives in **MySQL**; **MongoDB** holds event-style logs; **Redis** caches hot reads; **Kafka** carries domain events. A small **React + Vite** console talks to the same APIs you can hit from **Postman** or **Swagger UI**.

---

## What’s in this repo

| Area | Location |
|------|----------|
| REST API (FastAPI) | `backend/` |
| MySQL schema | `backend/db/init.sql` |
| Synthetic seeder | `backend/seed_data.py` |
| OpenAPI 3 JSON (static) | `docs/openapi.json` — import into [Swagger Editor](https://editor.swagger.io/) or codegen tools |
| Live Swagger / ReDoc | Run the API → `http://localhost:8000/docs` and `/redoc` |
| Postman | `postman/LinkedIn_Platform_API.postman_collection.json` + `postman/Local.postman_environment.json` |
| Infra | `docker-compose.yml` |
| Web UI | `frontend/` |

---

## Tech stack

- **Python 3.9+** — FastAPI, Uvicorn, Pydantic v2, SQLAlchemy 2, aiokafka, redis-py, Motor/PyMongo, httpx, optional Ollama client.
- **MySQL 8** — relational core (profiles, jobs, applications, threads, etc.).
- **MongoDB 7** — event logs and agent-related documents.
- **Redis 7** — cache for member/job reads and search slices.
- **Apache Kafka 3.7 (KRaft)** — async events (`job.created`, `application.submitted`, …).
- **Ollama** (optional, on the host) — local LLM for AI routes; code falls back if the model is unreachable.
- **Node 18+** — Vite 8, React 19, TypeScript for the console.

---

## Prerequisites

On macOS (similar on Linux):

- Docker Desktop (or Docker Engine + Compose)
- Python 3.9+ for the backend venv
- Node 18+ and npm for the frontend
- (Optional) [Ollama](https://ollama.com/) with a model such as `llama3.2` for full AI behavior

---

## Quick start

### 1. Clone and enter the project

```bash
git clone <your-fork-or-remote-url> linkedin-agentic-ai
cd linkedin-agentic-ai
```

### 2. Start infrastructure

From the **repository root** (where `docker-compose.yml` lives):

```bash
docker compose up -d
```

Wait until `linkedin-mysql` is **healthy** (`docker ps`). First boot creates the `linkedin` database and tables from `backend/db/init.sql`.

### 3. Configure the backend

```bash
cp .env.example backend/.env
```

Adjust values if you changed passwords or ports in Compose. Important defaults:

- MySQL: `localhost:3306`, user `linkedin_user`, DB `linkedin`
- MongoDB: `localhost:27017`, user `mongo_user`, DB `linkedin`
- Redis: `localhost:6379`
- Kafka: **`localhost:9094`** (the broker advertises `EXTERNAL` on 9094 for clients on your machine)

### 4. Python virtualenv and dependencies

```bash
cd backend
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 5. Seed data

**Fast smoke test** (small dataset, non-interactive):

```bash
python seed_data.py --quick --yes
```

**Full class-scale dataset** (tens of thousands of rows; takes a while):

```bash
python seed_data.py --yes
```

Without `--yes`, the script prompts before wiping existing rows.

### 6. Run the API

Still in `backend/` with the venv active:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- **Swagger UI:** http://localhost:8000/docs  
- **ReDoc:** http://localhost:8000/redoc  
- **Health:** http://localhost:8000/health  

### 7. Run the React console

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 — the dev server **proxies** `/api/*` to `http://127.0.0.1:8000`, so keep the API running.

For a **production build** served separately, set `VITE_API_URL` (see `frontend/.env.example`) to your API origin.

---

## API documentation

1. **Interactive (recommended while developing):** start Uvicorn and use `/docs` or `/redoc`.
2. **Static OpenAPI file:** `docs/openapi.json` — regenerate after changing routes:

   ```bash
   cd /path/to/repo
   backend/venv/bin/python backend/scripts/export_openapi.py
   ```

3. **Postman:** Import `postman/LinkedIn_Platform_API.postman_collection.json` and `postman/Local.postman_environment.json`. Select the **Local** environment so `{{base_url}}` resolves to `http://localhost:8000`.

---

## Project layout (backend)

- `main.py` — FastAPI app, CORS, router registration, lifespan (Kafka producer/consumer).
- `config.py` / `.env` — settings.
- `database.py` — SQLAlchemy engine + Motor Mongo client.
- `cache.py` — Redis wrapper.
- `kafka_producer.py` / `kafka_consumer.py` — event publish + consume.
- `models/` — SQLAlchemy models.
- `schemas/` — Pydantic request/response models.
- `routers/` — members, recruiters, jobs, applications, messages, connections, analytics, AI.
- `agents/` — resume parser, matcher, outreach, hiring assistant orchestration.

---

## Challenges we hit during setup (so you don’t have to rediscover them)

1. **Kafka from the host vs Docker**  
   Inside Compose, brokers talk on `kafka:9092`. On your laptop, use **`KAFKA_BOOTSTRAP_SERVERS=localhost:9094`** so the client hits the `EXTERNAL` listener defined in `docker-compose.yml`.

2. **MySQL init script path**  
   The compose file mounts `./backend/db/init.sql` into `/docker-entrypoint-initdb.d/`. If tables are missing, confirm that path is correct relative to where you run `docker compose`.

3. **MongoDB authentication**  
   The URI includes user/password from `.env.example`. If you see `Authentication failed` in logs, verify `MONGO_USER` / `MONGO_PASSWORD` match `MONGO_INITDB_ROOT_*` in Compose. The API may still run for MySQL-heavy routes; features that write to Mongo (e.g. event ingest) need a working auth pair.

4. **Seeder and Faker versions**  
   Some relative date strings (e.g. `-1Y`) are not parsed consistently across Faker releases. The seeder uses explicit `timedelta` windows so it runs cleanly on the pinned `faker` in `requirements.txt`.

5. **Ollama**  
   AI endpoints work without Ollama but use **heuristic / rule-based** output. Install Ollama and pull `llama3.2` (or set `OLLAMA_MODEL`) for LLM-backed behavior.

6. **Frontend API base URL**  
   In dev, use the Vite proxy (`/api`). For `npm run preview` or a static host, set `VITE_API_URL` or you’ll get network errors to the wrong origin.

---

## Development notes

- **CORS** is permissive (`allow_origins=["*"]`) for class demos; tighten for production.
- **Kafka consumer** runs in the same process as the API for simplicity; in production you’d usually split workers.
- **`.env`** is gitignored; never commit real secrets.

---

## License / academic use

Built for **DATA236** (LinkedIn Agentic AI class project). Adapt attribution and license to your course policy.

---

## Contributing (team workflow)

1. Branch from `main`, keep commits focused.
2. Run `python seed_data.py --quick --yes` after schema changes.
3. Regenerate `docs/openapi.json` when routers change.
4. Run `npm run build` in `frontend/` before merging UI work.

If something in this README drifts from the code, trust the repo — and please update the README in the same PR.
