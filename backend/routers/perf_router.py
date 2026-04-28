"""
Performance Router — /perf/*
Exposes real-time performance and observability data for the Performance Dashboard.

These endpoints are intentionally unauthenticated so the frontend can poll them
without requiring a JWT.  They are read-only and return no sensitive user data.

Kafka stats come from MongoDB (event_logs, processed_events, dead_letters).
Because the MongoDB instance is hosted on AWS and Kafka consumers write to it
continuously, these counts reflect live streaming activity — not cached numbers.
"""

import json
import logging
import os
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, text

from database import mongo_db, get_db
from cache import cache
from models.member import Member
from models.recruiter import Recruiter
from models.job import JobPosting
from models.application import Application
from models.connection import Connection
from models.message import Message
from models.post import Post

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

        total_applications = 0
        async for doc in mongo_db.analytics_applications_daily.find({}, {"count": 1, "_id": 0}):
            total_applications += doc.get("count", 0)

        total_conn_requested = 0
        total_conn_accepted = 0
        async for doc in mongo_db.analytics_connections_daily.find({}, {"requested": 1, "accepted": 1, "_id": 0}):
            total_conn_requested += doc.get("requested", 0)
            total_conn_accepted += doc.get("accepted", 0)

        return {
            "status": "ok",
            "totals": {
                "events_logged": total_logged,
                "events_processed_unique": total_processed,
                "dead_letters": total_dead,
                "events_last_24h": events_24h,
                "job_clicks_aggregated": total_clicks,
                "job_saves_aggregated": total_saves,
                "applications_aggregated": total_applications,
                "connections_requested_aggregated": total_conn_requested,
                "connections_accepted_aggregated": total_conn_accepted,
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


@router.get("/mysql-stats", summary="Live MySQL table counts and top-N breakdowns")
def mysql_stats(db: Session = Depends(get_db)):
    """
    Returns live row counts and simple aggregates from MySQL.
    Used by the Performance Dashboard to show the relational layer is active.
    """
    try:
        members      = db.query(func.count(Member.member_id)).scalar() or 0
        recruiters   = db.query(func.count(Recruiter.recruiter_id)).scalar() or 0
        jobs         = db.query(func.count(JobPosting.job_id)).scalar() or 0
        applications = db.query(func.count(Application.application_id)).scalar() or 0
        connections  = db.query(func.count(Connection.connection_id)).scalar() or 0
        messages     = db.query(func.count(Message.message_id)).scalar() or 0
        posts        = db.query(func.count(Post.post_id)).scalar() or 0

        # Applications by status
        app_by_status = (
            db.query(Application.status, func.count(Application.application_id).label("cnt"))
            .group_by(Application.status)
            .order_by(text("cnt DESC"))
            .all()
        )

        # Top 5 locations by member count
        top_locations = (
            db.query(Member.location_city, func.count(Member.member_id).label("cnt"))
            .filter(Member.location_city.isnot(None))
            .group_by(Member.location_city)
            .order_by(text("cnt DESC"))
            .limit(5)
            .all()
        )

        # Top 5 job titles
        top_jobs = (
            db.query(JobPosting.title, func.count(JobPosting.job_id).label("cnt"))
            .group_by(JobPosting.title)
            .order_by(text("cnt DESC"))
            .limit(5)
            .all()
        )

        return {
            "status": "ok",
            "totals": {
                "members": members,
                "recruiters": recruiters,
                "jobs": jobs,
                "applications": applications,
                "connections": connections,
                "messages": messages,
                "posts": posts,
            },
            "applications_by_status": [{"status": s, "count": c} for s, c in app_by_status],
            "top_locations": [{"city": city, "count": cnt} for city, cnt in top_locations],
            "top_job_titles": [{"title": title, "count": cnt} for title, cnt in top_jobs],
        }

    except Exception as e:
        logger.error(f"mysql_stats error: {e}")
        return {"status": "error", "error": str(e)}


@router.get("/bench-results", summary="Benchmark results from load_tests/results.json")
async def bench_results():
    """
    Reads and returns the full benchmark artifact generated by
    load_tests/perf_comparison.py --json > load_tests/results.json.

    Includes performance metrics, run metadata (date, machine, seed profile),
    methodology notes, and the analysis block (cache impact %, Kafka overhead,
    scaling estimates).  The frontend uses this to populate the benchmark
    chart and analysis callouts with real run data.

    Falls back to a minimal error envelope if the file is not found or cannot
    be parsed — the frontend will show its embedded constants instead.
    """
    # Path relative to this file: backend/routers/perf_router.py → ../load_tests/
    # results.json lives at backend/load_tests/results.json (inside Docker build context)
    results_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "..", "load_tests", "results.json",
    )
    try:
        with open(results_path, "r") as f:
            data = json.load(f)
        return {"status": "ok", **data}
    except FileNotFoundError:
        return {"status": "not_found", "message": "load_tests/results.json not found — run perf_comparison.py --json > results.json"}
    except Exception as e:
        logger.error(f"bench_results read error: {e}")
        return {"status": "error", "message": str(e)}


@router.get("/event-trend", summary="Daily Kafka-driven event counts for the last N days")
async def event_trend(days: int = 14):
    """
    Returns a merged daily time-series of Kafka-driven event counts from the four
    pre-aggregated MongoDB collections.  One row per calendar day within the window.

    Collections read:
      - analytics_job_clicks_daily    → job_clicks
      - analytics_saves_daily         → job_saves
      - analytics_applications_daily  → applications
      - analytics_connections_daily   → conn_requested, conn_accepted

    The series is sorted oldest-first so it can be rendered directly as a
    left-to-right time-series chart in the Performance Dashboard.
    """
    try:
        days = max(1, min(days, 90))
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")

        # Build a merged dict keyed by date string
        merged: dict = {}

        def _row(date_str: str) -> dict:
            if date_str not in merged:
                merged[date_str] = {
                    "date": date_str,
                    "job_clicks": 0,
                    "job_saves": 0,
                    "applications": 0,
                    "conn_requested": 0,
                    "conn_accepted": 0,
                }
            return merged[date_str]

        async for doc in mongo_db.analytics_job_clicks_daily.find(
            {"date": {"$gte": cutoff}}, {"_id": 0, "date": 1, "clicks": 1}
        ):
            _row(doc["date"])["job_clicks"] += doc.get("clicks", 0)

        async for doc in mongo_db.analytics_saves_daily.find(
            {"date": {"$gte": cutoff}}, {"_id": 0, "date": 1, "saves": 1}
        ):
            _row(doc["date"])["job_saves"] += doc.get("saves", 0)

        async for doc in mongo_db.analytics_applications_daily.find(
            {"date": {"$gte": cutoff}}, {"_id": 0, "date": 1, "count": 1}
        ):
            _row(doc["date"])["applications"] += doc.get("count", 0)

        async for doc in mongo_db.analytics_connections_daily.find(
            {"date": {"$gte": cutoff}}, {"_id": 0, "date": 1, "requested": 1, "accepted": 1}
        ):
            _row(doc["date"])["conn_requested"] += doc.get("requested", 0)
            _row(doc["date"])["conn_accepted"] += doc.get("accepted", 0)

        series = sorted(merged.values(), key=lambda r: r["date"])

        return {
            "status": "ok",
            "days": days,
            "series": series,
        }

    except Exception as e:
        logger.error(f"event_trend error: {e}")
        return {"status": "error", "error": str(e), "days": days, "series": []}
