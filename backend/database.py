"""
LinkedIn Platform — Database Connections
Handles MySQL (SQLAlchemy) and MongoDB (motor) connections.
"""

import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING
from config import settings

logger = logging.getLogger(__name__)

# ─── MySQL (SQLAlchemy) ─────────────────────────────────────────
engine = create_engine(
    settings.MYSQL_URL,
    pool_size=20,
    max_overflow=10,
    pool_recycle=3600,
    pool_pre_ping=True,
    echo=settings.DEBUG,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Dependency that provides a database session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ─── MongoDB (motor — async) ────────────────────────────────────
mongo_client = AsyncIOMotorClient(settings.MONGO_URL)
mongo_db = mongo_client[settings.MONGO_DATABASE]

# Collections
event_logs_collection = mongo_db["event_logs"]
agent_traces_collection = mongo_db["agent_traces"]
agent_tasks_collection = mongo_db["agent_tasks"]


def get_mongo():
    """Returns the MongoDB database instance."""
    return mongo_db


# ─── MongoDB index creation ─────────────────────────────────────
async def create_mongo_indexes() -> None:
    """
    Create MongoDB indexes for all collections used by this application.

    Called once during application startup (main.py lifespan).
    create_index is idempotent — re-running is safe and fast when the index
    already exists.

    Index rationale
    ---------------
    agent_tasks
      task_id  (unique) — every find_one / update_one in hiring_assistant.py
                          filters on this field; without an index every call
                          does a full collection scan.
      status            — rehydrate_tasks() queries {"status": {"$in": [...]}}
                          on startup; an index keeps this fast even as the
                          collection grows over many demo runs.

    processed_events
      idempotency_key (unique) — find_one({"idempotency_key": ...}) is called
                                 for EVERY Kafka message in the consumer hot
                                 path (kafka_consumer.py:74).  Without an index
                                 throughput degrades linearly with collection
                                 size.

    event_logs
      event_type — all event handlers insert with this field; future analytics
                   queries (e.g. "show all job.viewed events") will filter on it.
      timestamp  — event logs are time-series; range queries by timestamp are
                   the natural access pattern for dashboards and audits.

    agent_traces
      task_id    — traces are written per-member per-step for each AI task.
                   Debugging or replaying a task requires fetching all traces
                   for a given task_id; a full scan becomes slow once thousands
                   of traces accumulate across many workflow runs.
    """
    try:
        # agent_tasks ────────────────────────────────────────────
        await mongo_db.agent_tasks.create_index(
            "task_id", unique=True, name="task_id_unique"
        )
        await mongo_db.agent_tasks.create_index(
            "status", name="status_1"
        )

        # processed_events ───────────────────────────────────────
        await mongo_db.processed_events.create_index(
            "idempotency_key", unique=True, name="idempotency_key_unique"
        )

        # event_logs ─────────────────────────────────────────────
        await mongo_db.event_logs.create_index(
            "event_type", name="event_type_1"
        )
        await mongo_db.event_logs.create_index(
            [("timestamp", ASCENDING)], name="timestamp_1"
        )

        # agent_traces ───────────────────────────────────────────
        await mongo_db.agent_traces.create_index(
            "task_id", name="task_id_1"
        )

        # analytics_job_clicks_daily ─────────────────────────────
        # Pre-aggregated click counts per job per calendar day.
        # Compound unique index supports upsert (job_id+date) and
        # range queries by date for the clicks_per_job endpoint.
        await mongo_db.analytics_job_clicks_daily.create_index(
            [("job_id", ASCENDING), ("date", ASCENDING)],
            unique=True,
            name="job_id_date_unique",
        )
        await mongo_db.analytics_job_clicks_daily.create_index(
            "date", name="date_1"
        )

        # analytics_saves_daily ──────────────────────────────────
        # Pre-aggregated saved-job counts per calendar day.
        # Unique on date supports upsert; date index supports range
        # queries for the saves_trend endpoint.
        await mongo_db.analytics_saves_daily.create_index(
            "date", unique=True, name="date_unique"
        )
        await mongo_db.analytics_saves_daily.create_index(
            "week", name="week_1"
        )

        logger.info("✓ MongoDB indexes ensured")
    except Exception as e:
        # Non-fatal: indexes are a performance optimisation, not a correctness
        # requirement.  Log and continue so the app still starts.
        logger.warning(f"✗ MongoDB index creation failed: {e}")
