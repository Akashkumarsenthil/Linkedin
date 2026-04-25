"""
Job Service — Job Posting CRUD, Search, Close, and Save APIs
Includes Redis caching, Kafka event publishing, and search filters.
"""

import base64
import json
import logging
from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, desc, text

from database import get_db, SessionLocal
from models.job import JobPosting, SavedJob
from models.recruiter import Recruiter
from models.failed_kafka_event import FailedKafkaEvent
from auth import require_recruiter, require_member, TokenPayload
from schemas.job import (
    JobCreate, JobGet, JobUpdate, JobSearch, JobClose, JobByRecruiter,
    SaveJobRequest, JobResponse, JobListResponse,
)
from cache import cache
from kafka_producer import kafka_producer

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/jobs", tags=["Job Service"])


def _log_failed_kafka_event(
    topic: str, event_type: str, entity_id: str, actor_id: str, payload: dict, error: Exception
) -> None:
    """Persist a failed Kafka publish so it is not silently lost (dual-write fallback)."""
    try:
        fke = FailedKafkaEvent(
            topic=topic,
            event_type=event_type,
            entity_id=str(entity_id),
            actor_id=str(actor_id),
            payload=json.dumps(payload, default=str),
            error_message=str(error)[:500],
        )
        db = SessionLocal()
        try:
            db.add(fke)
            db.commit()
            logger.warning(f"Kafka publish failed for {event_type} → recorded in failed_kafka_events (id={fke.id})")
        finally:
            db.close()
    except Exception as fb_err:
        logger.error(f"Could not write to failed_kafka_events: {fb_err}")


# ── Cursor helpers ───────────────────────────────────────────────────────────

def _encode_cursor(data: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(data, default=str).encode()).decode()


def _decode_cursor(cursor: str) -> dict:
    try:
        return json.loads(base64.urlsafe_b64decode(cursor + "==").decode())
    except Exception:
        return {}


@router.post("/create", response_model=JobResponse, summary="Create a new job posting")
async def create_job(
    req: JobCreate,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(require_recruiter),
):
    """
    Create a new job posting. The recruiter_id must reference an existing recruiter.
    Publishes a job.created event to Kafka.
    """
    if req.recruiter_id != current_user.user_id:
        return JobResponse(success=False, message="Cannot create job posting on behalf of another recruiter")

    # Verify recruiter exists
    recruiter = db.query(Recruiter).filter(Recruiter.recruiter_id == req.recruiter_id).first()
    if not recruiter:
        return JobResponse(success=False, message=f"Recruiter {req.recruiter_id} not found")

    job = JobPosting(
        recruiter_id=req.recruiter_id,
        company_id=req.company_id or recruiter.company_id,
        title=req.title,
        description=req.description,
        seniority_level=req.seniority_level,
        employment_type=req.employment_type,
        location=req.location,
        work_mode=req.work_mode,
        skills_required=req.skills_required,
        salary_min=req.salary_min,
        salary_max=req.salary_max,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Publish Kafka event with business-derived idempotency key
    try:
        await kafka_producer.publish(
            topic="job.created",
            event_type="job.created",
            actor_id=str(req.recruiter_id),
            entity_type="job",
            entity_id=str(job.job_id),
            payload={"title": job.title, "location": job.location},
            idempotency_key=f"job_created:{job.job_id}",
        )
    except Exception as e:
        logger.warning(f"Kafka publish failed for job.created: {e}")
        _log_failed_kafka_event(
            "job.created", "job.created", str(job.job_id), str(req.recruiter_id),
            {"title": job.title, "location": job.location}, e,
        )

    cache.delete_pattern("jobs:search:*")
    return JobResponse(success=True, message="Job posting created successfully", data=job.to_dict())


@router.post("/get", response_model=JobResponse, summary="Get job posting by ID")
async def get_job(req: JobGet, db: Session = Depends(get_db)):
    """Retrieve a job posting's full details by job_id. Publishes a job.viewed event."""
    cache_key = f"jobs:get:{req.job_id}"
    cached = cache.get(cache_key)
    if cached:
        return JobResponse(success=True, message="Job retrieved (cached)", data=cached)

    job = db.query(JobPosting).filter(JobPosting.job_id == req.job_id).first()
    if not job:
        return JobResponse(success=False, message=f"Job {req.job_id} not found")

    data = job.to_dict()
    cache.set(cache_key, data, ttl=300)

    # Publish view event
    try:
        await kafka_producer.publish(
            topic="job.viewed",
            event_type="job.viewed",
            actor_id="system",
            entity_type="job",
            entity_id=str(req.job_id),
            payload={},
        )
    except Exception:
        pass

    return JobResponse(success=True, message="Job retrieved successfully", data=data)


@router.post("/update", response_model=JobResponse, summary="Update job posting fields")
async def update_job(
    req: JobUpdate,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(require_recruiter),
):
    """Update specific fields of a job posting. Only the posting recruiter may update."""
    job = db.query(JobPosting).filter(JobPosting.job_id == req.job_id).first()
    if not job:
        return JobResponse(success=False, message=f"Job {req.job_id} not found")

    if job.recruiter_id != current_user.user_id:
        return JobResponse(success=False, message="Only the posting recruiter can update this job")

    update_fields = req.model_dump(exclude_unset=True, exclude={"job_id"})
    for field, value in update_fields.items():
        if value is not None:
            setattr(job, field, value)

    db.commit()
    db.refresh(job)

    cache.delete(f"jobs:get:{req.job_id}")
    cache.delete_pattern("jobs:search:*")
    return JobResponse(success=True, message="Job updated successfully", data=job.to_dict())


@router.post("/search", response_model=JobListResponse, summary="Search and filter job postings")
async def search_jobs(req: JobSearch, db: Session = Depends(get_db)):
    """
    Search job postings with full-text matching, salary filters, and cursor-based pagination.

    **Keyword search**: uses MySQL FULLTEXT (MATCH … AGAINST) on title + description for
    relevance ranking; falls back to LIKE for very short keywords (< 3 chars).

    **Cursor pagination**: pass the `next_cursor` from a previous response as `cursor` in
    the next request.  Cursor-based pagination is keyset-stable when sorting by date (default).
    When sorting by `applicants` or `views` the cursor encodes offset position.

    **Salary filters**: `salary_min` matches jobs whose `salary_max >= salary_min`;
    `salary_max` matches jobs whose `salary_min <= salary_max`.

    **Backwards compatible**: existing callers using `page` / `page_size` continue to work.
    """
    # Build a stable cache key that covers all filter + pagination dimensions
    cursor_key = req.cursor or ""
    cache_key = (
        f"jobs:search:{req.keyword}:{req.location}:{req.employment_type}:"
        f"{req.work_mode}:{req.seniority_level}:{req.salary_min}:{req.salary_max}:"
        f"{req.sort_by}:{req.page}:{req.page_size}:{cursor_key}"
    )
    cached = cache.get(cache_key)
    if cached:
        return JobListResponse(**cached)

    query = db.query(JobPosting).filter(JobPosting.status == "open")

    # ── Keyword filter ────────────────────────────────────────────────────────
    using_fulltext = False
    if req.keyword:
        kw = req.keyword.strip()
        if len(kw) >= 3:
            # Full-text boolean mode — wrap each word with + for AND semantics
            ft_query = " ".join(f"+{w}*" for w in kw.split() if w)
            query = query.filter(
                text("MATCH(title, description) AGAINST(:kw IN BOOLEAN MODE)").bindparams(kw=ft_query)
            )
            using_fulltext = True
        else:
            # Short keyword: fall back to LIKE
            like_kw = f"%{kw}%"
            query = query.filter(
                or_(JobPosting.title.like(like_kw), JobPosting.description.like(like_kw))
            )

    # ── Structural filters ────────────────────────────────────────────────────
    if req.location:
        query = query.filter(JobPosting.location.like(f"%{req.location}%"))

    if req.employment_type:
        query = query.filter(JobPosting.employment_type == req.employment_type)

    if req.work_mode:
        query = query.filter(JobPosting.work_mode == req.work_mode)

    if req.seniority_level:
        query = query.filter(JobPosting.seniority_level == req.seniority_level)

    if req.skills:
        for skill in req.skills:
            # Match exact skill name as a JSON string element
            query = query.filter(
                or_(
                    JobPosting.skills_required.like(f'%"{skill}"%'),
                    JobPosting.skills_required.like(f'%{skill}%'),
                )
            )

    # ── Salary filters ────────────────────────────────────────────────────────
    if req.salary_min is not None:
        # Job's upper bound must be >= what the candidate wants as minimum
        query = query.filter(
            or_(
                JobPosting.salary_max >= req.salary_min,
                JobPosting.salary_max.is_(None),
            )
        )

    if req.salary_max is not None:
        # Job's lower bound must be <= the candidate's maximum budget
        query = query.filter(
            or_(
                JobPosting.salary_min <= req.salary_max,
                JobPosting.salary_min.is_(None),
            )
        )

    # ── Sort order ────────────────────────────────────────────────────────────
    sort_by = (req.sort_by or "date").lower()

    if using_fulltext and sort_by == "date":
        # When full-text is active, sort by relevance first, then date as tiebreaker
        order_exprs = [
            text("MATCH(title, description) AGAINST(:kw2 IN BOOLEAN MODE) DESC").bindparams(
                kw2=" ".join(f"+{w}*" for w in req.keyword.split() if w)
            ),
            desc(JobPosting.posted_datetime),
            desc(JobPosting.job_id),
        ]
        # Relevance-based: cursor encodes offset (stable enough for UX)
        sort_mode = "offset"
    elif sort_by == "applicants":
        order_exprs = [desc(JobPosting.applicants_count), desc(JobPosting.job_id)]
        sort_mode = "offset"
    elif sort_by == "views":
        order_exprs = [desc(JobPosting.views_count), desc(JobPosting.job_id)]
        sort_mode = "offset"
    else:
        # Default: date — supports true keyset pagination
        order_exprs = [desc(JobPosting.posted_datetime), desc(JobPosting.job_id)]
        sort_mode = "keyset"

    # ── Pagination ────────────────────────────────────────────────────────────
    if req.cursor:
        c = _decode_cursor(req.cursor)
        cursor_type = c.get("type", "keyset")

        if cursor_type == "keyset" and sort_mode == "keyset":
            # True keyset: WHERE (posted_datetime, job_id) < (cursor_dt, cursor_id)
            cursor_dt = c.get("dt")
            cursor_id = c.get("id", 0)
            if cursor_dt:
                query = query.filter(
                    or_(
                        JobPosting.posted_datetime < cursor_dt,
                        and_(
                            JobPosting.posted_datetime == cursor_dt,
                            JobPosting.job_id < cursor_id,
                        ),
                    )
                )
            jobs_page = query.order_by(*order_exprs).limit(req.page_size + 1).all()
        else:
            # Offset-encoded cursor
            offset = c.get("offset", 0)
            jobs_page = query.order_by(*order_exprs).offset(offset).limit(req.page_size + 1).all()
    else:
        # No cursor — standard offset or first keyset page
        if sort_mode == "keyset":
            # First page: no WHERE clause needed, just limit
            jobs_page = query.order_by(*order_exprs).limit(req.page_size + 1).all()
        else:
            offset = (req.page - 1) * req.page_size
            jobs_page = query.order_by(*order_exprs).offset(offset).limit(req.page_size + 1).all()

    # ── Determine has_more and build next_cursor ──────────────────────────────
    has_more = len(jobs_page) > req.page_size
    if has_more:
        jobs_page = jobs_page[: req.page_size]

    next_cursor: str | None = None
    if has_more and jobs_page:
        last = jobs_page[-1]
        if sort_mode == "keyset":
            next_cursor = _encode_cursor({
                "type": "keyset",
                "dt": last.posted_datetime.isoformat() if last.posted_datetime else None,
                "id": last.job_id,
            })
        else:
            # Encode next offset position
            if req.cursor:
                c = _decode_cursor(req.cursor)
                base_offset = c.get("offset", (req.page - 1) * req.page_size)
            else:
                base_offset = (req.page - 1) * req.page_size
            next_cursor = _encode_cursor({
                "type": "offset",
                "offset": base_offset + req.page_size,
            })

    # ── total count (skip expensive COUNT when cursor pagination used) ─────────
    total: int | None = None
    if not req.cursor:
        # Only compute total on the first (non-cursor) page to avoid repeated COUNT(*)
        try:
            total = query.count()
        except Exception:
            total = None

    result = JobListResponse(
        success=True,
        message=f"Found {len(jobs_page)} job postings" + (f" of {total}" if total is not None else ""),
        data=[j.to_dict() for j in jobs_page],
        total=total,
        page=req.page if not req.cursor else None,
        page_size=req.page_size,
        next_cursor=next_cursor,
        has_more=has_more,
    )
    cache.set(cache_key, result.model_dump(), ttl=60)
    return result


@router.post("/close", response_model=JobResponse, summary="Close a job posting")
async def close_job(
    req: JobClose,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(require_recruiter),
):
    """
    Close a job posting (open → closed). Applications to closed jobs will be rejected.
    """
    job = db.query(JobPosting).filter(JobPosting.job_id == req.job_id).first()
    if not job:
        return JobResponse(success=False, message=f"Job {req.job_id} not found")

    if job.recruiter_id != current_user.user_id:
        return JobResponse(success=False, message="Only the posting recruiter can close this job")

    if job.status == "closed":
        return JobResponse(success=False, message="Job is already closed")

    job.status = "closed"
    db.commit()
    db.refresh(job)

    try:
        await kafka_producer.publish(
            topic="job.closed",
            event_type="job.closed",
            actor_id=str(job.recruiter_id),
            entity_type="job",
            entity_id=str(req.job_id),
            payload={"title": job.title},
            idempotency_key=f"job_closed:{req.job_id}",
        )
    except Exception as e:
        _log_failed_kafka_event(
            "job.closed", "job.closed", str(req.job_id), str(job.recruiter_id),
            {"title": job.title}, e,
        )

    cache.delete(f"jobs:get:{req.job_id}")
    cache.delete_pattern("jobs:search:*")
    return JobResponse(success=True, message="Job closed successfully", data=job.to_dict())


@router.post("/byRecruiter", response_model=JobListResponse, summary="List jobs by recruiter")
async def jobs_by_recruiter(req: JobByRecruiter, db: Session = Depends(get_db)):
    """List all job postings created by a specific recruiter."""
    query = db.query(JobPosting).filter(JobPosting.recruiter_id == req.recruiter_id)
    total = query.count()
    offset = (req.page - 1) * req.page_size
    jobs = query.order_by(desc(JobPosting.posted_datetime)).offset(offset).limit(req.page_size).all()

    return JobListResponse(
        success=True,
        message=f"Found {total} jobs for recruiter {req.recruiter_id}",
        data=[j.to_dict() for j in jobs],
        total=total,
        page=req.page,
        page_size=req.page_size,
    )


@router.post("/save", response_model=JobResponse, summary="Save a job for later")
async def save_job(
    req: SaveJobRequest,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(require_member),
):
    """Save a job posting to a member's saved list."""
    if req.member_id != current_user.user_id:
        return JobResponse(success=False, message="Cannot save job on behalf of another member")

    existing = db.query(SavedJob).filter(
        SavedJob.member_id == req.member_id, SavedJob.job_id == req.job_id
    ).first()
    if existing:
        return JobResponse(success=False, message="Job already saved")

    saved = SavedJob(member_id=req.member_id, job_id=req.job_id)
    db.add(saved)
    db.commit()

    try:
        await kafka_producer.publish(
            topic="job.saved",
            event_type="job.saved",
            actor_id=str(req.member_id),
            entity_type="job",
            entity_id=str(req.job_id),
            payload={},
            idempotency_key=f"job_save:{req.member_id}:{req.job_id}",
        )
    except Exception:
        pass

    return JobResponse(success=True, message="Job saved successfully")
