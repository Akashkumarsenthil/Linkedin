"""
Job Service — Job Posting CRUD, Search, Close, and Save APIs
Includes Redis caching, Kafka event publishing, and search filters.
"""

import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc

from database import get_db
from models.job import JobPosting, SavedJob
from models.recruiter import Recruiter
from schemas.job import (
    JobCreate, JobGet, JobUpdate, JobSearch, JobClose, JobByRecruiter,
    SaveJobRequest, JobResponse, JobListResponse,
)
from cache import cache
from kafka_producer import kafka_producer

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/jobs", tags=["Job Service"])


@router.post("/create", response_model=JobResponse, summary="Create a new job posting")
async def create_job(req: JobCreate, db: Session = Depends(get_db)):
    """
    Create a new job posting. The recruiter_id must reference an existing recruiter.
    Publishes a job.created event to Kafka.
    """
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

    # Publish Kafka event
    try:
        await kafka_producer.publish(
            topic="job.created",
            event_type="job.created",
            actor_id=str(req.recruiter_id),
            entity_type="job",
            entity_id=str(job.job_id),
            payload={"title": job.title, "location": job.location},
        )
    except Exception as e:
        logger.warning(f"Kafka publish failed for job.created: {e}")

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
async def update_job(req: JobUpdate, db: Session = Depends(get_db)):
    """Update specific fields of a job posting."""
    job = db.query(JobPosting).filter(JobPosting.job_id == req.job_id).first()
    if not job:
        return JobResponse(success=False, message=f"Job {req.job_id} not found")

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
    Search job postings by keyword, location, type, work mode, seniority, and skills.
    Results are paginated and cached for 60 seconds.
    """
    cache_key = f"jobs:search:{req.keyword}:{req.location}:{req.employment_type}:{req.work_mode}:{req.seniority_level}:{req.page}:{req.page_size}"
    cached = cache.get(cache_key)
    if cached:
        return JobListResponse(**cached)

    query = db.query(JobPosting).filter(JobPosting.status == "open")

    if req.keyword:
        kw = f"%{req.keyword}%"
        query = query.filter(
            or_(JobPosting.title.like(kw), JobPosting.description.like(kw))
        )

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
            query = query.filter(JobPosting.skills_required.like(f'%"{skill}"%'))

    total = query.count()
    offset = (req.page - 1) * req.page_size
    jobs = query.order_by(desc(JobPosting.posted_datetime)).offset(offset).limit(req.page_size).all()

    result = JobListResponse(
        success=True,
        message=f"Found {total} job postings",
        data=[j.to_dict() for j in jobs],
        total=total,
        page=req.page,
        page_size=req.page_size,
    )
    cache.set(cache_key, result.model_dump(), ttl=60)
    return result


@router.post("/close", response_model=JobResponse, summary="Close a job posting")
async def close_job(req: JobClose, db: Session = Depends(get_db)):
    """
    Close a job posting (open → closed). Applications to closed jobs will be rejected.
    """
    job = db.query(JobPosting).filter(JobPosting.job_id == req.job_id).first()
    if not job:
        return JobResponse(success=False, message=f"Job {req.job_id} not found")

    if job.status == "closed":
        return JobResponse(success=False, message="Job is already closed")

    job.status = "closed"
    db.commit()
    db.refresh(job)

    # Publish event
    try:
        await kafka_producer.publish(
            topic="job.closed",
            event_type="job.closed",
            actor_id=str(job.recruiter_id),
            entity_type="job",
            entity_id=str(req.job_id),
            payload={"title": job.title},
        )
    except Exception:
        pass

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
async def save_job(req: SaveJobRequest, db: Session = Depends(get_db)):
    """Save a job posting to a member's saved list."""
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
        )
    except Exception:
        pass

    return JobResponse(success=True, message="Job saved successfully")
