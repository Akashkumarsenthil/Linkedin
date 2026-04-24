"""
Recruiter Service — Recruiter CRUD APIs
"""

import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models.recruiter import Recruiter
from auth import require_recruiter, TokenPayload
from schemas.recruiter import (
    RecruiterCreate, RecruiterGet, RecruiterUpdate, RecruiterDelete,
    RecruiterResponse, RecruiterListResponse,
)
from cache import cache

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/recruiters", tags=["Recruiter Service"])


@router.post("/create", response_model=RecruiterResponse, summary="Create a new recruiter")
async def create_recruiter(req: RecruiterCreate, db: Session = Depends(get_db)):
    """Create a new recruiter/employer admin account."""
    existing = db.query(Recruiter).filter(Recruiter.email == req.email).first()
    if existing:
        return RecruiterResponse(success=False, message=f"Email '{req.email}' already exists")

    recruiter = Recruiter(
        first_name=req.first_name,
        last_name=req.last_name,
        email=req.email,
        phone=req.phone,
        company_id=req.company_id,
        company_name=req.company_name,
        company_industry=req.company_industry,
        company_size=req.company_size,
        role=req.role,
        access_level=req.access_level,
    )
    db.add(recruiter)
    db.commit()
    db.refresh(recruiter)

    return RecruiterResponse(success=True, message="Recruiter created successfully", data=recruiter.to_dict())


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

    recruiter = db.query(Recruiter).filter(Recruiter.recruiter_id == req.recruiter_id).first()
    if not recruiter:
        return RecruiterResponse(success=False, message=f"Recruiter {req.recruiter_id} not found")

    db.delete(recruiter)
    db.commit()

    cache.delete(f"recruiters:get:{req.recruiter_id}")
    return RecruiterResponse(success=True, message="Recruiter deleted successfully")
