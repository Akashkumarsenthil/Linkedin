"""
Analytics Service — Event Ingestion, Dashboards, and Metrics APIs
Provides recruiter and member analytics with MongoDB event logs.
"""

import logging
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter
from sqlalchemy import func as sql_func, desc

from database import get_db, mongo_db, SessionLocal
from models.job import JobPosting, SavedJob
from models.application import Application
from models.member import Member, ProfileViewDaily
from schemas.analytics import (
    EventIngest, TopJobsRequest, FunnelRequest, GeoRequest,
    MemberDashboardRequest, AnalyticsResponse,
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
    event_doc = {
        "event_type": req.event_type,
        "actor_id": req.actor_id,
        "entity_type": req.entity_type,
        "entity_id": req.entity_id,
        "payload": req.payload or {},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    # Store in MongoDB
    await mongo_db.event_logs.insert_one(event_doc)

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
