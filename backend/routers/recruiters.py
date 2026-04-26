"""
Recruiter Service — Recruiter CRUD APIs
"""

import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text

from database import get_db
from models.recruiter import Recruiter
from models.user_credentials import UserCredentials
from auth import require_recruiter, TokenPayload
from schemas.recruiter import (
    RecruiterGet, RecruiterUpdate, RecruiterDelete,
    RecruiterResponse, RecruiterListResponse,
)
from cache import cache

from sqlalchemy import or_

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

    # 1. Delete connections (polymorphic, no FK)
    db.execute(text("DELETE FROM connections WHERE requester_id = :id OR receiver_id = :id"), {"id": req.recruiter_id})

    # 2. Delete thread participants and messages (polymorphic, no FK)
    db.execute(text("DELETE FROM thread_participants WHERE user_id = :id AND user_type = 'recruiter'"), {"id": req.recruiter_id})
    db.execute(text("DELETE FROM messages WHERE sender_id = :id AND sender_type = 'recruiter'"), {"id": req.recruiter_id})

    # 3. Delete authentication credentials (MANDATORY)
    db.query(UserCredentials).filter(
        UserCredentials.user_id == req.recruiter_id,
        UserCredentials.user_type == "recruiter"
    ).delete()

    # 4. Delete the recruiter profile if it exists
    recruiter = db.query(Recruiter).filter(Recruiter.recruiter_id == req.recruiter_id).first()
    if recruiter:
        db.delete(recruiter)
    
    db.commit()

    cache.delete(f"recruiters:get:{req.recruiter_id}")
    return RecruiterResponse(success=True, message="Recruiter deleted successfully")

from pydantic import BaseModel
from typing import Optional


class RecruiterSearch(BaseModel):
    keyword: Optional[str] = None
    page: int = 1
    page_size: int = 10


@router.post("/search", response_model=RecruiterListResponse, summary="Search recruiters")
async def search_recruiters(req: RecruiterSearch, db: Session = Depends(get_db)):
    """Search recruiters by keyword matching first_name, last_name, company_name, role, or industry."""
    query = db.query(Recruiter)

    if req.keyword:
        kw = f"%{req.keyword.strip()}%"
        query = query.filter(
            or_(
                Recruiter.first_name.like(kw),
                Recruiter.last_name.like(kw),
                Recruiter.company_name.like(kw),
                Recruiter.role.like(kw),
                Recruiter.company_industry.like(kw),
            )
        )

    total = query.count()
    offset = (req.page - 1) * req.page_size
    recruiters = query.offset(offset).limit(req.page_size).all()

    return RecruiterListResponse(
        success=True,
        message=f"Found {total} recruiters",
        data=[r.to_dict() for r in recruiters],
    )
