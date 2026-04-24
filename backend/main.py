"""
LinkedIn Agentic AI Platform — Main FastAPI Application
Central entry point that registers all service routers and manages lifecycle.
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from kafka_producer import kafka_producer
from kafka_consumer import kafka_consumer
from routers import members, recruiters, jobs, applications, messages, connections, analytics, ai_service
from routers import auth_router
from agents.hiring_assistant import rehydrate_tasks, run_dispatcher
from database import create_mongo_indexes, engine, Base
import models.user_credentials  # register model with Base.metadata before create_all

# ─── Logging ────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


# ─── Lifecycle Events ──────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle management."""
    logger.info("=" * 60)
    logger.info(f"  {settings.APP_NAME} v{settings.APP_VERSION}")
    logger.info("=" * 60)

    # Start Kafka producer
    try:
        await kafka_producer.start()
        logger.info("✓ Kafka producer connected")
    except Exception as e:
        logger.warning(f"✗ Kafka producer failed to start: {e}")

    # Start Kafka consumer in background
    consumer_task = None
    try:
        topics = [
            "job.viewed", "job.saved", "job.created", "job.closed",
            "application.submitted", "application.statusChanged",
            "message.sent", "connection.requested", "connection.accepted",
            "profile.viewed",
            "ai.requests", "ai.results",
        ]
        await kafka_consumer.start(topics)
        consumer_task = asyncio.create_task(kafka_consumer.consume())
        logger.info("✓ Kafka consumer started")
    except Exception as e:
        logger.warning(f"✗ Kafka consumer failed to start: {e}")

    # Create any missing SQL tables (idempotent — adds user_credentials if not exists)
    try:
        Base.metadata.create_all(bind=engine, checkfirst=True)
        logger.info("✓ SQL tables verified / created")
    except Exception as e:
        logger.warning(f"✗ SQL table creation failed: {e}")

    # Ensure MongoDB indexes exist
    try:
        await create_mongo_indexes()
    except Exception as e:
        logger.warning(f"✗ MongoDB index creation failed: {e}")

    # Rehydrate AI task state from MongoDB
    try:
        restored = await rehydrate_tasks()
        logger.info(f"✓ AI task rehydration complete ({restored} task(s) restored/re-queued)")
    except Exception as e:
        logger.warning(f"✗ AI task rehydration failed: {e}")

    # Start AI workflow dispatcher (bounded-concurrency queue drain)
    dispatcher_task = asyncio.create_task(run_dispatcher(), name="ai-dispatcher")
    logger.info("✓ AI workflow dispatcher started")

    logger.info("✓ All services ready")
    logger.info(f"  Swagger UI:  http://localhost:8000/docs")
    logger.info(f"  ReDoc:       http://localhost:8000/redoc")
    logger.info("=" * 60)

    yield

    # Shutdown
    logger.info("Shutting down services...")
    dispatcher_task.cancel()
    try:
        await asyncio.gather(dispatcher_task, return_exceptions=True)
    except Exception:
        pass
    try:
        await kafka_producer.stop()
    except Exception:
        pass
    try:
        await kafka_consumer.stop()
        if consumer_task:
            consumer_task.cancel()
    except Exception:
        pass
    logger.info("Shutdown complete")


# ─── App Instance ──────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    description="""
## LinkedIn Agentic AI Platform API

A distributed LinkedIn-style platform with microservices, Kafka event streaming,
Redis caching, and Agentic AI workflows.

### Services
- **Profile Service** — Member CRUD and search (`/members/*`)
- **Recruiter Service** — Recruiter management (`/recruiters/*`)
- **Job Service** — Job postings CRUD, search, and save (`/jobs/*`)
- **Application Service** — Job applications and status management (`/applications/*`)
- **Messaging Service** — Threads and messages (`/threads/*`, `/messages/*`)
- **Connection Service** — Connection requests and management (`/connections/*`)
- **Analytics Service** — Events, dashboards, and metrics (`/events/*`, `/analytics/*`)
- **AI Agent Service** — Agentic AI workflows with Ollama (`/ai/*`)

### Architecture
- **MySQL** — Transactional data (profiles, jobs, applications)
- **MongoDB** — Event logs, agent traces, unstructured data
- **Redis** — SQL query caching and session management
- **Kafka** — Async event streaming and agent orchestration
- **Ollama** — Local LLM for AI agent skills
    """,
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)


# ─── CORS Middleware ───────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Register Routers ─────────────────────────────────────────
app.include_router(members.router)
app.include_router(recruiters.router)
app.include_router(jobs.router)
app.include_router(applications.router)
app.include_router(messages.router)
app.include_router(connections.router)
app.include_router(analytics.router)
app.include_router(ai_service.router)
app.include_router(auth_router.router)


# ─── Health Check ──────────────────────────────────────────────
@app.get("/", tags=["Health"])
async def root():
    """Health check endpoint."""
    return {
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
        "docs": "/docs",
    }


@app.get("/health", tags=["Health"])
async def health_check():
    """Detailed health check with dependency status."""
    from cache import cache
    from database import mongo_client, engine
    from sqlalchemy import text

    mongo_ok = False
    try:
        await mongo_client.admin.command("ping")
        mongo_ok = True
    except Exception:
        mongo_ok = False

    mysql_ok = False
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        mysql_ok = True
    except Exception:
        mysql_ok = False

    services = {
        "api": True,
        "mysql": mysql_ok,
        "mongo": mongo_ok,
        "redis": cache.health_check(),
        "kafka": kafka_producer.producer is not None,
    }

    return {
        "status": "healthy" if all(services.values()) else "degraded",
        "services": services,
        # Back-compat keys (flat) so UIs that check root-level still work
        **{k: ("ok" if v else "down") for k, v in services.items()},
    }
