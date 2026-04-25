"""
Performance Router — /perf/*
Exposes real-time performance and observability data for the Performance Dashboard.

These endpoints are intentionally unauthenticated so the frontend can poll them
without requiring a JWT.  They are read-only and return no sensitive user data.

Kafka stats come from MongoDB (event_logs, processed_events, dead_letters).
Because the MongoDB instance is hosted on AWS and Kafka consumers write to it
continuously, these counts reflect live streaming activity — not cached numbers.
"""

import logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter

from database import mongo_db
from cache import cache

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/perf", tags=["Performance"])


@router.get("/kafka-stats", summary="Live Kafka event statistics from MongoDB")
async def kafka_stats():
    """
    Returns real-time Kafka event counts sourced directly from MongoDB.

    Collections queried:
      - event_logs          : every event dispatched by the consumer
      - processed_events    : idempotency records (unique events successfully handled)
      - dead_letters        : messages that exceeded MAX_DELIVERY_ATTEMPTS and were parked
      - analytics_job_clicks_daily : pre-aggregated daily job click counts
      - analytics_saves_daily      : pre-aggregated daily job save counts

    Since the MongoDB instance is hosted on AWS and consumers write here
    continuously, these numbers reflect the current live state of the pipeline.
    """
    try:
        # ── Aggregate counts ──────────────────────────────────────────────────
        total_logged = await mongo_db.event_logs.count_documents({})
        total_processed = await mongo_db.processed_events.count_documents({})
        total_dead = await mongo_db.dead_letters.count_documents({})

        # ── Events by type ────────────────────────────────────────────────────
        by_type_cursor = mongo_db.event_logs.aggregate([
            {"$group": {"_id": "$event_type", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 10},
        ])
        by_type = [
            {"event_type": d["_id"] or "unknown", "count": d["count"]}
            async for d in by_type_cursor
        ]

        # ── Last 24 h activity ────────────────────────────────────────────────
        since_24h = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        events_24h = await mongo_db.event_logs.count_documents(
            {"timestamp": {"$gte": since_24h}}
        )

        # ── Most recent 8 events ──────────────────────────────────────────────
        recent_cursor = mongo_db.event_logs.find(
            {},
            {
                "_id": 0,
                "event_type": 1,
                "timestamp": 1,
                "actor_id": 1,
                "entity": 1,
                "trace_id": 1,
            },
        ).sort("timestamp", -1).limit(8)
        recent_events = [doc async for doc in recent_cursor]

        # ── Pre-aggregated analytics totals ───────────────────────────────────
        total_clicks = 0
        async for doc in mongo_db.analytics_job_clicks_daily.find({}, {"clicks": 1, "_id": 0}):
            total_clicks += doc.get("clicks", 0)

        total_saves = 0
        async for doc in mongo_db.analytics_saves_daily.find({}, {"saves": 1, "_id": 0}):
            total_saves += doc.get("saves", 0)

        return {
            "status": "ok",
            "totals": {
                "events_logged": total_logged,
                "events_processed_unique": total_processed,
                "dead_letters": total_dead,
                "events_last_24h": events_24h,
                "job_clicks_aggregated": total_clicks,
                "job_saves_aggregated": total_saves,
            },
            "events_by_type": by_type,
            "recent_events": recent_events,
        }

    except Exception as e:
        logger.error(f"kafka_stats error: {e}")
        return {
            "status": "error",
            "error": str(e),
            "totals": {},
            "events_by_type": [],
            "recent_events": [],
        }


@router.get("/cache-stats", summary="In-process Redis cache hit/miss counters")
async def perf_cache_stats():
    """
    Returns the in-process hit/miss counters from the Redis cache singleton.
    These reset when the backend process restarts.
    Also returns Redis connectivity status.
    """
    stats = cache.stats()
    healthy = cache.health_check()
    return {
        "redis_online": healthy,
        **stats,
    }
