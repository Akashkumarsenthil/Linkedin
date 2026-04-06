"""
Analytics Service — Event Ingestion, Dashboards, and Metrics APIs
Provides recruiter and member analytics with MongoDB event logs.
"""

import logging
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter
from sqlalchemy import func as sql_func, desc, asc, extract, case, literal_column

from database import get_db, mongo_db, SessionLocal
from models.job import JobPosting, SavedJob
from models.application import Application
from models.member import Member, ProfileViewDaily
from schemas.analytics import (
    EventIngest, TopJobsRequest, FunnelRequest, GeoRequest,
    MemberDashboardRequest, LeastAppliedRequest, SavesTrendRequest,
    ClicksPerJobRequest, AnalyticsResponse,
)
from kafka_producer import kafka_producer

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Analytics Service"])


@router.post("/events/ingest", response_model=AnalyticsResponse, summary="Ingest tracking events")
async def ingest_event(req: EventIngest):
    """
    Ingest a tracking event from UI or services.
    Events are stored in MongoDB and published to Kafka for async processing.
    """
    try:
        event_doc = {
            "event_type": req.event_type,
            "actor_id": req.actor_id,
            "entity_type": req.entity_type,
            "entity_id": req.entity_id,
            "payload": req.payload or {},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        # Store in MongoDB (use copy since insert_one adds _id)
        await mongo_db.event_logs.insert_one(event_doc.copy())

        # Publish to Kafka
        try:
            await kafka_producer.publish(
                topic=f"events.{req.event_type.replace('.', '_')}",
                event_type=req.event_type,
                actor_id=req.actor_id,
                entity_type=req.entity_type,
                entity_id=req.entity_id,
                payload=req.payload or {},
            )
        except Exception as e:
            logger.warning(f"Kafka publish failed for event: {e}")

        return AnalyticsResponse(success=True, message="Event ingested successfully")
    except Exception as e:
        logger.error(f"Event ingest failed: {e}")
        return AnalyticsResponse(success=False, message=f"Event ingest failed: {str(e)}")


@router.post("/analytics/jobs/top", response_model=AnalyticsResponse, summary="Top jobs by metric")
async def top_jobs(req: TopJobsRequest):
    """
    Get top job postings by metric (applications, views, or saves).
    Used for recruiter dashboard analytics.
    """
    db = SessionLocal()
    try:
        cutoff = datetime.now() - timedelta(days=req.window_days)

        if req.metric == "applications":
            results = (
                db.query(
                    JobPosting.job_id,
                    JobPosting.title,
                    JobPosting.location,
                    sql_func.count(Application.application_id).label("count"),
                )
                .join(Application, Application.job_id == JobPosting.job_id)
                .filter(Application.application_datetime >= cutoff)
                .group_by(JobPosting.job_id)
                .order_by(desc("count"))
                .limit(req.limit)
                .all()
            )
        elif req.metric == "views":
            results = (
                db.query(
                    JobPosting.job_id,
                    JobPosting.title,
                    JobPosting.location,
                    JobPosting.views_count.label("count"),
                )
                .filter(JobPosting.posted_datetime >= cutoff)
                .order_by(desc(JobPosting.views_count))
                .limit(req.limit)
                .all()
            )
        elif req.metric == "saves":
            results = (
                db.query(
                    JobPosting.job_id,
                    JobPosting.title,
                    JobPosting.location,
                    sql_func.count(SavedJob.id).label("count"),
                )
                .join(SavedJob, SavedJob.job_id == JobPosting.job_id)
                .filter(SavedJob.saved_at >= cutoff)
                .group_by(JobPosting.job_id)
                .order_by(desc("count"))
                .limit(req.limit)
                .all()
            )
        else:
            return AnalyticsResponse(success=False, message=f"Unknown metric: {req.metric}")

        data = [
            {"job_id": r[0], "title": r[1], "location": r[2], "count": r[3]}
            for r in results
        ]

        return AnalyticsResponse(
            success=True,
            message=f"Top {req.limit} jobs by {req.metric}",
            data=data,
        )
    finally:
        db.close()


@router.post("/analytics/funnel", response_model=AnalyticsResponse, summary="Job application funnel")
async def job_funnel(req: FunnelRequest):
    """
    Get the view → save → apply funnel for a specific job posting.
    Data sourced from MongoDB event logs and MySQL records.
    """
    db = SessionLocal()
    try:
        job = db.query(JobPosting).filter(JobPosting.job_id == req.job_id).first()
        if not job:
            return AnalyticsResponse(success=False, message=f"Job {req.job_id} not found")

        views = job.views_count or 0
        saves = db.query(SavedJob).filter(SavedJob.job_id == req.job_id).count()
        applications = db.query(Application).filter(Application.job_id == req.job_id).count()

        funnel = {
            "job_id": req.job_id,
            "title": job.title,
            "views": views,
            "saves": saves,
            "applications": applications,
            "view_to_save_rate": round(saves / max(views, 1) * 100, 2),
            "save_to_apply_rate": round(applications / max(saves, 1) * 100, 2),
            "view_to_apply_rate": round(applications / max(views, 1) * 100, 2),
        }

        return AnalyticsResponse(success=True, message="Funnel data retrieved", data=funnel)
    finally:
        db.close()


@router.post("/analytics/geo", response_model=AnalyticsResponse, summary="Geographic distribution")
async def geo_distribution(req: GeoRequest):
    """
    Get the city/state distribution of applicants for a specific job posting.
    """
    db = SessionLocal()
    try:
        results = (
            db.query(
                Member.location_city,
                Member.location_state,
                sql_func.count(Application.application_id).label("count"),
            )
            .join(Application, Application.member_id == Member.member_id)
            .filter(Application.job_id == req.job_id)
            .group_by(Member.location_city, Member.location_state)
            .order_by(desc("count"))
            .all()
        )

        data = [
            {"city": r[0] or "Unknown", "state": r[1] or "Unknown", "count": r[2]}
            for r in results
        ]

        return AnalyticsResponse(
            success=True,
            message=f"Geo distribution for job {req.job_id}",
            data=data,
        )
    finally:
        db.close()


@router.post(
    "/analytics/member/dashboard",
    response_model=AnalyticsResponse,
    summary="Member dashboard metrics",
)
async def member_dashboard(req: MemberDashboardRequest):
    """
    Get member dashboard metrics: profile views (last 30 days) and application status breakdown.
    """
    db = SessionLocal()
    try:
        member = db.query(Member).filter(Member.member_id == req.member_id).first()
        if not member:
            return AnalyticsResponse(success=False, message=f"Member {req.member_id} not found")

        # Profile views — last 30 days
        cutoff = datetime.now().date() - timedelta(days=30)
        views = (
            db.query(ProfileViewDaily)
            .filter(
                ProfileViewDaily.member_id == req.member_id,
                ProfileViewDaily.view_date >= cutoff,
            )
            .order_by(ProfileViewDaily.view_date)
            .all()
        )
        profile_views = [
            {"date": str(v.view_date), "views": v.view_count} for v in views
        ]

        # Application status breakdown
        status_counts = (
            db.query(Application.status, sql_func.count(Application.application_id))
            .filter(Application.member_id == req.member_id)
            .group_by(Application.status)
            .all()
        )
        status_breakdown = {s[0]: s[1] for s in status_counts}

        data = {
            "member_id": req.member_id,
            "name": f"{member.first_name} {member.last_name}",
            "total_connections": member.connections_count or 0,
            "profile_views_30d": profile_views,
            "total_views_30d": sum(v.view_count for v in views),
            "application_status_breakdown": status_breakdown,
            "total_applications": sum(status_breakdown.values()),
        }

        return AnalyticsResponse(
            success=True, message="Dashboard metrics retrieved", data=data
        )
    finally:
        db.close()


# ── Recruiter / Admin Dashboard Endpoints (brief §requirements) ──────────────


@router.post(
    "/analytics/jobs/top-monthly",
    response_model=AnalyticsResponse,
    summary="Top 10 jobs by applications, grouped by month",
)
async def top_jobs_monthly(req: TopJobsRequest):
    """
    Brief requirement: "Top 10 job postings by applications per month."
    Groups applications by calendar month and returns the top N jobs
    within the requested look-back window.  Each result row contains the
    month label (YYYY-MM) and the count.
    Data source: MySQL  applications + job_postings (JOIN + GROUP BY).
    """
    db = SessionLocal()
    try:
        cutoff = datetime.now() - timedelta(days=req.window_days)

        month_label = sql_func.date_format(
            Application.application_datetime, "%Y-%m"
        ).label("month")

        results = (
            db.query(
                month_label,
                JobPosting.job_id,
                JobPosting.title,
                JobPosting.location,
                sql_func.count(Application.application_id).label("count"),
            )
            .join(Application, Application.job_id == JobPosting.job_id)
            .filter(Application.application_datetime >= cutoff)
            .group_by(month_label, JobPosting.job_id)
            .order_by(desc("count"))
            .limit(req.limit)
            .all()
        )

        data = [
            {
                "month": r[0],
                "job_id": r[1],
                "title": r[2],
                "location": r[3],
                "count": r[4],
            }
            for r in results
        ]

        return AnalyticsResponse(
            success=True,
            message=f"Top {req.limit} jobs by applications (monthly), last {req.window_days} days",
            data=data,
        )
    finally:
        db.close()


@router.post(
    "/analytics/geo/monthly",
    response_model=AnalyticsResponse,
    summary="City-wise applications per month for a job",
)
async def geo_monthly(req: GeoRequest):
    """
    Brief requirement: "City-wise applications per month for a selected job posting."
    Same as /analytics/geo but grouped by calendar month.
    Data source: MySQL  applications + members (JOIN + GROUP BY month, city).
    """
    db = SessionLocal()
    try:
        cutoff = datetime.now() - timedelta(days=req.window_days)
        month_label = sql_func.date_format(
            Application.application_datetime, "%Y-%m"
        ).label("month")

        results = (
            db.query(
                month_label,
                Member.location_city,
                Member.location_state,
                sql_func.count(Application.application_id).label("count"),
            )
            .join(Application, Application.member_id == Member.member_id)
            .filter(
                Application.job_id == req.job_id,
                Application.application_datetime >= cutoff,
            )
            .group_by(month_label, Member.location_city, Member.location_state)
            .order_by(month_label, desc("count"))
            .all()
        )

        data = [
            {
                "month": r[0],
                "city": r[1] or "Unknown",
                "state": r[2] or "Unknown",
                "count": r[3],
            }
            for r in results
        ]

        return AnalyticsResponse(
            success=True,
            message=f"City-wise monthly applications for job {req.job_id}",
            data=data,
        )
    finally:
        db.close()


@router.post(
    "/analytics/jobs/least-applied",
    response_model=AnalyticsResponse,
    summary="Top 5 jobs with fewest applications",
)
async def least_applied_jobs(req: LeastAppliedRequest):
    """
    Brief requirement: "Top 5 job postings with the fewest applications."
    Returns open jobs ordered ascending by application count.
    Data source: MySQL  job_postings LEFT JOIN applications (GROUP BY + ASC).
    Uses LEFT JOIN so jobs with zero applications are included.
    """
    db = SessionLocal()
    try:
        cutoff = datetime.now() - timedelta(days=req.window_days)

        results = (
            db.query(
                JobPosting.job_id,
                JobPosting.title,
                JobPosting.location,
                sql_func.count(Application.application_id).label("count"),
            )
            .outerjoin(Application, Application.job_id == JobPosting.job_id)
            .filter(
                JobPosting.status == "open",
                JobPosting.posted_datetime >= cutoff,
            )
            .group_by(JobPosting.job_id)
            .order_by(asc("count"))
            .limit(req.limit)
            .all()
        )

        data = [
            {"job_id": r[0], "title": r[1], "location": r[2], "count": r[3]}
            for r in results
        ]

        return AnalyticsResponse(
            success=True,
            message=f"Bottom {req.limit} jobs by application count",
            data=data,
        )
    finally:
        db.close()


@router.post(
    "/analytics/jobs/clicks",
    response_model=AnalyticsResponse,
    summary="Clicks (views) per job posting from event logs",
)
async def clicks_per_job(req: ClicksPerJobRequest):
    """
    Brief requirement: "Clicks per job posting (from logs)."
    Queries MongoDB event_logs for 'job.viewed' events, groups by entity_id
    (the job_id), and returns per-job click counts.
    Data source: MongoDB event_logs collection.
    """
    try:
        cutoff = (datetime.now() - timedelta(days=req.window_days)).isoformat()

        pipeline = [
            {
                "$match": {
                    "event_type": "job.viewed",
                    "timestamp": {"$gte": cutoff},
                }
            },
            {
                "$group": {
                    "_id": "$entity_id",
                    "clicks": {"$sum": 1},
                }
            },
            {"$sort": {"clicks": -1}},
            {"$limit": req.limit},
        ]

        cursor = mongo_db.event_logs.aggregate(pipeline)
        raw = await cursor.to_list(length=req.limit)

        # Enrich with job titles from MySQL
        job_ids = [int(r["_id"]) for r in raw if r["_id"]]
        titles = {}
        if job_ids:
            db = SessionLocal()
            try:
                rows = (
                    db.query(JobPosting.job_id, JobPosting.title)
                    .filter(JobPosting.job_id.in_(job_ids))
                    .all()
                )
                titles = {r[0]: r[1] for r in rows}
            finally:
                db.close()

        data = [
            {
                "job_id": int(r["_id"]) if r["_id"] else 0,
                "title": titles.get(int(r["_id"]), f"Job #{r['_id']}"),
                "clicks": r["clicks"],
            }
            for r in raw
            if r["_id"]
        ]

        return AnalyticsResponse(
            success=True,
            message=f"Top {req.limit} jobs by clicks (event logs), last {req.window_days} days",
            data=data,
        )
    except Exception as e:
        logger.error(f"Clicks-per-job query failed: {e}")
        return AnalyticsResponse(
            success=False,
            message=f"Clicks query failed: {str(e)}",
        )


@router.post(
    "/analytics/saves/trend",
    response_model=AnalyticsResponse,
    summary="Saved jobs per day or week",
)
async def saves_trend(req: SavesTrendRequest):
    """
    Brief requirement: "Number of saved jobs per day/week (from logs)."
    Aggregates saved_jobs rows by day or ISO week.
    Data source: MySQL saved_jobs table (saved_at timestamp).
    """
    db = SessionLocal()
    try:
        cutoff = datetime.now() - timedelta(days=req.window_days)

        if req.granularity == "week":
            period_label = sql_func.date_format(
                SavedJob.saved_at, "%x-W%v"
            ).label("period")
        else:
            period_label = sql_func.date(SavedJob.saved_at).label("period")

        results = (
            db.query(
                period_label,
                sql_func.count(SavedJob.id).label("count"),
            )
            .filter(SavedJob.saved_at >= cutoff)
            .group_by(period_label)
            .order_by(period_label)
            .all()
        )

        data = [
            {"period": str(r[0]), "count": r[1]}
            for r in results
        ]

        return AnalyticsResponse(
            success=True,
            message=f"Saved-jobs trend ({req.granularity}), last {req.window_days} days",
            data=data,
        )
    finally:
        db.close()
