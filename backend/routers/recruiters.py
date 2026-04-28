"""
Recruiter Service — Recruiter CRUD APIs
"""

import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import or_

from database import get_db
from models.recruiter import Recruiter
from auth import require_recruiter, TokenPayload
from schemas.recruiter import (
    RecruiterGet, RecruiterUpdate, RecruiterDelete, RecruiterSearch,
    RecruiterResponse, RecruiterListResponse,
)
from cache import cache

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/recruiters", tags=["Recruiter Service"])


# NOTE: Creating a recruiter profile is intentionally not exposed as a public
# endpoint.  New recruiter accounts must be created through
# `POST /auth/register/recruiter`, which atomically creates both the profile
# *and* the login credentials.  Exposing a raw create endpoint would allow any
# caller to seed orphan recruiter rows with no associated password.


@router.post("/get", response_model=RecruiterResponse, summary="Get recruiter by ID")
async def get_recruiter(req: RecruiterGet, db: Session = Depends(get_db)):
    """Retrieve a recruiter's profile by recruiter_id."""
    cache_key = f"recruiters:get:{req.recruiter_id}"
    cached = cache.get(cache_key)
    if cached:
        return RecruiterResponse(success=True, message="Recruiter retrieved (cached)", data=cached)

    recruiter = db.query(Recruiter).filter(Recruiter.recruiter_id == req.recruiter_id).first()
    if not recruiter:
        return RecruiterResponse(success=False, message=f"Recruiter {req.recruiter_id} not found")

    data = recruiter.to_dict()
    cache.set(cache_key, data, ttl=300)
    return RecruiterResponse(success=True, message="Recruiter retrieved successfully", data=data)


@router.post("/search", response_model=RecruiterListResponse, summary="Search recruiters by name or company")
async def search_recruiters(req: RecruiterSearch, db: Session = Depends(get_db)):
    """Public search for messaging recipient picker (name → id)."""
    kw = (req.keyword or "").strip()
    if len(kw) < 2:
        return RecruiterListResponse(success=True, message="Enter at least 2 characters", data=[])

    like = f"%{kw}%"
    rows = (
        db.query(Recruiter)
        .filter(
            or_(
                Recruiter.first_name.like(like),
                Recruiter.last_name.like(like),
                Recruiter.company_name.like(like),
            )
        )
        .order_by(Recruiter.recruiter_id)
        .limit(req.page_size)
        .all()
    )
    return RecruiterListResponse(
        success=True,
        message=f"Found {len(rows)} recruiters",
        data=[r.to_dict() for r in rows],
    )


@router.post("/update", response_model=RecruiterResponse, summary="Update recruiter fields")
async def update_recruiter(
    req: RecruiterUpdate,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(require_recruiter),
):
    """Update specific fields of a recruiter's own profile."""
    if req.recruiter_id != current_user.user_id:
        return RecruiterResponse(success=False, message="Cannot update another recruiter's profile")

    recruiter = db.query(Recruiter).filter(Recruiter.recruiter_id == req.recruiter_id).first()
    if not recruiter:
        return RecruiterResponse(success=False, message=f"Recruiter {req.recruiter_id} not found")

    update_fields = req.model_dump(exclude_unset=True, exclude={"recruiter_id"})
    for field, value in update_fields.items():
        if value is not None:
            setattr(recruiter, field, value)

    db.commit()
    db.refresh(recruiter)

    cache.delete(f"recruiters:get:{req.recruiter_id}")
    return RecruiterResponse(success=True, message="Recruiter updated successfully", data=recruiter.to_dict())


@router.post("/delete", response_model=RecruiterResponse, summary="Delete a recruiter")
async def delete_recruiter(
    req: RecruiterDelete,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(require_recruiter),
):
    """Permanently delete a recruiter's own account."""
    if req.recruiter_id != current_user.user_id:
        return RecruiterResponse(success=False, message="Cannot delete another recruiter's profile")

    recruiter = db.query(Recruiter).filter(Recruiter.recruiter_id == req.recruiter_id).first()
    if not recruiter:
        return RecruiterResponse(success=False, message=f"Recruiter {req.recruiter_id} not found")

    db.delete(recruiter)
    db.commit()

    cache.delete(f"recruiters:get:{req.recruiter_id}")
    return RecruiterResponse(success=True, message="Recruiter deleted successfully")
