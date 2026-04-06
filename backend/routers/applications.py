"""
Application Service — Job Application APIs
Handles submit, status management, and recruiter notes with proper error handling.
"""

import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc

from database import get_db
from models.application import Application
from models.job import JobPosting
from models.member import Member
from auth import require_member, TokenPayload
from schemas.application import (
    ApplicationSubmit, ApplicationGet, ApplicationByJob, ApplicationByMember,
    ApplicationUpdateStatus, ApplicationAddNote,
    ApplicationResponse, ApplicationListResponse,
)
from cache import cache
from kafka_producer import kafka_producer

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/applications", tags=["Application Service"])

VALID_STATUSES = {"submitted", "reviewing", "rejected", "interview", "offer"}


@router.post("/submit", response_model=ApplicationResponse, summary="Submit a job application")
async def submit_application(
    req: ApplicationSubmit,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(require_member),
):
    """
    Submit an application to a job posting.
    Handles: duplicate application, closed job, and missing member/job errors.
    """
    # Enforce caller can only submit as themselves
    if req.member_id != current_user.user_id:
        return ApplicationResponse(success=False, message="Cannot submit application on behalf of another member")

    # Check job exists and is open
    job = db.query(JobPosting).filter(JobPosting.job_id == req.job_id).first()
    if not job:
        return ApplicationResponse(success=False, message=f"Job {req.job_id} not found")
    if job.status == "closed":
        return ApplicationResponse(success=False, message="Cannot apply to a closed job posting")

    # Check member exists
    member = db.query(Member).filter(Member.member_id == req.member_id).first()
    if not member:
        return ApplicationResponse(success=False, message=f"Member {req.member_id} not found")

    # Check duplicate application
    existing = db.query(Application).filter(
        Application.job_id == req.job_id,
        Application.member_id == req.member_id,
    ).first()
    if existing:
        return ApplicationResponse(
            success=False,
            message=f"Member {req.member_id} has already applied to job {req.job_id}"
        )

    application = Application(
        job_id=req.job_id,
        member_id=req.member_id,
        resume_url=req.resume_url,
        resume_text=req.resume_text or member.resume_text,
        cover_letter=req.cover_letter,
        answers=req.answers,
    )
    db.add(application)

    # Update applicant count
    job.applicants_count = (job.applicants_count or 0) + 1

    db.commit()
    db.refresh(application)

    # Kafka event
    try:
        await kafka_producer.publish(
            topic="application.submitted",
            event_type="application.submitted",
            actor_id=str(req.member_id),
            entity_type="application",
            entity_id=str(application.application_id),
            payload={
                "job_id": req.job_id,
                "member_id": req.member_id,
                "resume_ref": req.resume_url or "inline_text",
            },
        )
    except Exception as e:
        logger.warning(f"Kafka publish failed: {e}")

    return ApplicationResponse(
        success=True, message="Application submitted successfully", data=application.to_dict()
    )


@router.post("/get", response_model=ApplicationResponse, summary="Get application details")
async def get_application(req: ApplicationGet, db: Session = Depends(get_db)):
    """Retrieve an application's full details by application_id."""
    app = db.query(Application).filter(Application.application_id == req.application_id).first()
    if not app:
        return ApplicationResponse(success=False, message=f"Application {req.application_id} not found")

    return ApplicationResponse(success=True, message="Application retrieved", data=app.to_dict())


@router.post("/byJob", response_model=ApplicationListResponse, summary="List applications for a job")
async def applications_by_job(req: ApplicationByJob, db: Session = Depends(get_db)):
    """List all applications for a specific job posting (recruiter view)."""
    query = db.query(Application).filter(Application.job_id == req.job_id)
    total = query.count()
    offset = (req.page - 1) * req.page_size
    apps = query.order_by(desc(Application.application_datetime)).offset(offset).limit(req.page_size).all()

    return ApplicationListResponse(
        success=True,
        message=f"Found {total} applications for job {req.job_id}",
        data=[a.to_dict() for a in apps],
        total=total,
        page=req.page,
        page_size=req.page_size,
    )


@router.post("/byMember", response_model=ApplicationListResponse, summary="List applications by member")
async def applications_by_member(req: ApplicationByMember, db: Session = Depends(get_db)):
    """List all applications submitted by a specific member."""
    query = db.query(Application).filter(Application.member_id == req.member_id)
    total = query.count()
    offset = (req.page - 1) * req.page_size
    apps = query.order_by(desc(Application.application_datetime)).offset(offset).limit(req.page_size).all()

    return ApplicationListResponse(
        success=True,
        message=f"Found {total} applications for member {req.member_id}",
        data=[a.to_dict() for a in apps],
        total=total,
        page=req.page,
        page_size=req.page_size,
    )


@router.post("/updateStatus", response_model=ApplicationResponse, summary="Update application status")
async def update_application_status(req: ApplicationUpdateStatus, db: Session = Depends(get_db)):
    """
    Update the status of an application.
    Valid statuses: submitted, reviewing, rejected, interview, offer.
    """
    if req.status not in VALID_STATUSES:
        return ApplicationResponse(
            success=False,
            message=f"Invalid status '{req.status}'. Must be one of: {', '.join(VALID_STATUSES)}"
        )

    app = db.query(Application).filter(Application.application_id == req.application_id).first()
    if not app:
        return ApplicationResponse(success=False, message=f"Application {req.application_id} not found")

    old_status = app.status
    app.status = req.status
    db.commit()
    db.refresh(app)

    # Kafka event
    try:
        await kafka_producer.publish(
            topic="application.statusChanged",
            event_type="application.statusChanged",
            actor_id="recruiter",
            entity_type="application",
            entity_id=str(req.application_id),
            payload={"old_status": old_status, "new_status": req.status},
        )
    except Exception:
        pass

    return ApplicationResponse(
        success=True,
        message=f"Application status updated: {old_status} → {req.status}",
        data=app.to_dict(),
    )


@router.post("/addNote", response_model=ApplicationResponse, summary="Add recruiter note")
async def add_note(req: ApplicationAddNote, db: Session = Depends(get_db)):
    """Add a recruiter note or decision rationale to an application."""
    app = db.query(Application).filter(Application.application_id == req.application_id).first()
    if not app:
        return ApplicationResponse(success=False, message=f"Application {req.application_id} not found")

    # Append to existing notes
    existing_notes = app.recruiter_notes or ""
    if existing_notes:
        app.recruiter_notes = f"{existing_notes}\n---\n{req.note}"
    else:
        app.recruiter_notes = req.note

    db.commit()
    db.refresh(app)

    return ApplicationResponse(success=True, message="Note added successfully", data=app.to_dict())
