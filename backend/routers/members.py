"""
Profile Service — Member CRUD and Search APIs
Handles member profile management with Redis caching and Kafka events.
"""

import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import or_, text

from database import get_db
from models.member import Member
from schemas.member import (
    MemberCreate, MemberGet, MemberUpdate, MemberDelete, MemberSearch,
    MemberResponse, MemberListResponse,
)
from cache import cache
from kafka_producer import kafka_producer

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/members", tags=["Profile Service"])


@router.post("/create", response_model=MemberResponse, summary="Create a new member profile")
async def create_member(req: MemberCreate, db: Session = Depends(get_db)):
    """
    Create a new member profile with all attributes.
    Returns an error if the email already exists (duplicate prevention).
    """
    # Check for duplicate email
    existing = db.query(Member).filter(Member.email == req.email).first()
    if existing:
        return MemberResponse(success=False, message=f"Email '{req.email}' already exists")

    member = Member(
        first_name=req.first_name,
        last_name=req.last_name,
        email=req.email,
        phone=req.phone,
        location_city=req.location_city,
        location_state=req.location_state,
        location_country=req.location_country,
        headline=req.headline,
        about=req.about,
        experience=req.experience,
        education=req.education,
        skills=req.skills,
        profile_photo_url=req.profile_photo_url,
        resume_text=req.resume_text,
    )
    db.add(member)
    db.commit()
    db.refresh(member)

    # Invalidate any cached member searches
    cache.delete_pattern("members:search:*")

    logger.info(f"Created member {member.member_id}: {member.email}")
    return MemberResponse(success=True, message="Member created successfully", data=member.to_dict())


@router.post("/get", response_model=MemberResponse, summary="Get member profile by ID")
async def get_member(req: MemberGet, db: Session = Depends(get_db)):
    """
    Retrieve a member's full profile by member_id.
    Uses Redis caching for frequently accessed profiles.
    """
    cache_key = f"members:get:{req.member_id}"

    # Try cache first
    cached = cache.get(cache_key)
    if cached:
        return MemberResponse(success=True, message="Member retrieved (cached)", data=cached)

    member = db.query(Member).filter(Member.member_id == req.member_id).first()
    if not member:
        return MemberResponse(success=False, message=f"Member {req.member_id} not found")

    data = member.to_dict()
    cache.set(cache_key, data, ttl=300)

    return MemberResponse(success=True, message="Member retrieved successfully", data=data)


@router.post("/update", response_model=MemberResponse, summary="Update member profile fields")
async def update_member(req: MemberUpdate, db: Session = Depends(get_db)):
    """
    Update specific fields of a member's profile.
    Only non-null fields in the request will be updated.
    """
    member = db.query(Member).filter(Member.member_id == req.member_id).first()
    if not member:
        return MemberResponse(success=False, message=f"Member {req.member_id} not found")

    update_fields = req.model_dump(exclude_unset=True, exclude={"member_id"})
    for field, value in update_fields.items():
        if value is not None:
            setattr(member, field, value)

    db.commit()
    db.refresh(member)

    # Invalidate cache
    cache.delete(f"members:get:{req.member_id}")
    cache.delete_pattern("members:search:*")

    return MemberResponse(success=True, message="Member updated successfully", data=member.to_dict())


@router.post("/delete", response_model=MemberResponse, summary="Delete a member profile")
async def delete_member(req: MemberDelete, db: Session = Depends(get_db)):
    """
    Permanently delete a member profile and all associated data.
    """
    member = db.query(Member).filter(Member.member_id == req.member_id).first()
    if not member:
        return MemberResponse(success=False, message=f"Member {req.member_id} not found")

    db.delete(member)
    db.commit()

    # Invalidate cache
    cache.delete(f"members:get:{req.member_id}")
    cache.delete_pattern("members:search:*")

    return MemberResponse(success=True, message="Member deleted successfully")


@router.post("/search", response_model=MemberListResponse, summary="Search members by filters")
async def search_members(req: MemberSearch, db: Session = Depends(get_db)):
    """
    Search members by keyword (name, headline, about), skill, or location.
    Results are paginated and cached for performance.
    """
    cache_key = f"members:search:{req.keyword}:{req.skill}:{req.location}:{req.page}:{req.page_size}"
    cached = cache.get(cache_key)
    if cached:
        return MemberListResponse(**cached)

    query = db.query(Member)

    if req.keyword:
        kw = f"%{req.keyword}%"
        query = query.filter(
            or_(
                Member.first_name.like(kw),
                Member.last_name.like(kw),
                Member.headline.like(kw),
                Member.about.like(kw),
            )
        )

    if req.location:
        loc = f"%{req.location}%"
        query = query.filter(
            or_(Member.location_city.like(loc), Member.location_state.like(loc))
        )

    if req.skill:
        # Search within JSON skills array
        query = query.filter(
            Member.skills.like(f'%"{req.skill}"%')
        )

    total = query.count()
    offset = (req.page - 1) * req.page_size
    members = query.offset(offset).limit(req.page_size).all()

    result = MemberListResponse(
        success=True,
        message=f"Found {total} members",
        data=[m.to_dict() for m in members],
        total=total,
        page=req.page,
        page_size=req.page_size,
    )

    cache.set(cache_key, result.model_dump(), ttl=60)
    return result
