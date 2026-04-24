"""
Profile Service — Member CRUD and Search APIs
Handles member profile management with Redis caching and Kafka events.
"""

import base64
import json
import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc, text

from database import get_db
from models.member import Member
from auth import require_member, TokenPayload
from schemas.member import (
    MemberCreate, MemberGet, MemberUpdate, MemberDelete, MemberSearch,
    MemberResponse, MemberListResponse,
)
from cache import cache
from kafka_producer import kafka_producer

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/members", tags=["Profile Service"])


# ── Cursor helpers ───────────────────────────────────────────────────────────

def _encode_cursor(data: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(data, default=str).encode()).decode()


def _decode_cursor(cursor: str) -> dict:
    try:
        return json.loads(base64.urlsafe_b64decode(cursor + "==").decode())
    except Exception:
        return {}


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

    # Publish profile view event (mirrors job.viewed pattern in routers/jobs.py)
    try:
        await kafka_producer.publish(
            topic="profile.viewed",
            event_type="profile.viewed",
            actor_id="system",
            entity_type="member",
            entity_id=str(req.member_id),
            payload={},
        )
    except Exception:
        pass

    return MemberResponse(success=True, message="Member retrieved successfully", data=data)


@router.post("/update", response_model=MemberResponse, summary="Update member profile fields")
async def update_member(
    req: MemberUpdate,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(require_member),
):
    """
    Update specific fields of a member's profile.
    Only non-null fields in the request will be updated.
    """
    if req.member_id != current_user.user_id:
        return MemberResponse(success=False, message="Cannot update another member's profile")

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
async def delete_member(
    req: MemberDelete,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(require_member),
):
    """
    Permanently delete a member profile and all associated data.
    """
    if req.member_id != current_user.user_id:
        return MemberResponse(success=False, message="Cannot delete another member's profile")

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
    Search members with full-text matching and cursor-based pagination.

    **Keyword search**: uses MySQL FULLTEXT (MATCH … AGAINST) on first_name, last_name,
    headline, and about for relevance ranking; falls back to LIKE for keywords < 3 chars.

    **Cursor pagination**: pass `next_cursor` from a previous response as `cursor`.
    Default sort is by `member_id ASC` (stable insertion order), enabling true keyset
    pagination.  Sort by `connections` or `recent` uses offset-encoded cursor.

    **Skill search**: searches the JSON skills array for exact or partial skill name match.
    """
    cursor_key = req.cursor or ""
    cache_key = (
        f"members:search:{req.keyword}:{req.skill}:{req.location}:"
        f"{req.sort_by}:{req.page}:{req.page_size}:{cursor_key}"
    )
    cached = cache.get(cache_key)
    if cached:
        return MemberListResponse(**cached)

    query = db.query(Member)

    # ── Keyword filter ────────────────────────────────────────────────────────
    using_fulltext = False
    if req.keyword:
        kw = req.keyword.strip()
        if len(kw) >= 3:
            ft_query = " ".join(f"+{w}*" for w in kw.split() if w)
            query = query.filter(
                text(
                    "MATCH(first_name, last_name, headline, about) AGAINST(:kw IN BOOLEAN MODE)"
                ).bindparams(kw=ft_query)
            )
            using_fulltext = True
        else:
            like_kw = f"%{kw}%"
            query = query.filter(
                or_(
                    Member.first_name.like(like_kw),
                    Member.last_name.like(like_kw),
                    Member.headline.like(like_kw),
                    Member.about.like(like_kw),
                )
            )

    # ── Location filter ───────────────────────────────────────────────────────
    if req.location:
        loc = f"%{req.location}%"
        query = query.filter(
            or_(Member.location_city.like(loc), Member.location_state.like(loc))
        )

    # ── Skill filter ──────────────────────────────────────────────────────────
    if req.skill:
        # Match both quoted (JSON string element) and bare substring
        query = query.filter(
            or_(
                Member.skills.like(f'%"{req.skill}"%'),
                Member.skills.like(f'%{req.skill}%'),
            )
        )

    # ── Sort order ────────────────────────────────────────────────────────────
    sort_by = (req.sort_by or "id").lower()

    if using_fulltext and sort_by == "id":
        # Full-text active: primary sort by relevance, tiebreak by member_id
        order_exprs = [
            text(
                "MATCH(first_name, last_name, headline, about) AGAINST(:kw2 IN BOOLEAN MODE) DESC"
            ).bindparams(kw2=" ".join(f"+{w}*" for w in req.keyword.split() if w)),
            Member.member_id,
        ]
        sort_mode = "offset"
    elif sort_by == "connections":
        order_exprs = [desc(Member.connections_count), Member.member_id]
        sort_mode = "offset"
    elif sort_by == "recent":
        order_exprs = [desc(Member.created_at), desc(Member.member_id)]
        sort_mode = "offset"
    else:
        # Default: stable member_id ascending — true keyset pagination
        order_exprs = [Member.member_id]
        sort_mode = "keyset"

    # ── Pagination ────────────────────────────────────────────────────────────
    if req.cursor:
        c = _decode_cursor(req.cursor)
        cursor_type = c.get("type", "keyset")

        if cursor_type == "keyset" and sort_mode == "keyset":
            cursor_id = c.get("id", 0)
            query = query.filter(Member.member_id > cursor_id)
            members_page = query.order_by(*order_exprs).limit(req.page_size + 1).all()
        else:
            offset = c.get("offset", 0)
            members_page = query.order_by(*order_exprs).offset(offset).limit(req.page_size + 1).all()
    else:
        if sort_mode == "keyset":
            members_page = query.order_by(*order_exprs).limit(req.page_size + 1).all()
        else:
            offset = (req.page - 1) * req.page_size
            members_page = query.order_by(*order_exprs).offset(offset).limit(req.page_size + 1).all()

    # ── has_more and next_cursor ──────────────────────────────────────────────
    has_more = len(members_page) > req.page_size
    if has_more:
        members_page = members_page[: req.page_size]

    next_cursor: str | None = None
    if has_more and members_page:
        last = members_page[-1]
        if sort_mode == "keyset":
            next_cursor = _encode_cursor({"type": "keyset", "id": last.member_id})
        else:
            if req.cursor:
                base_offset = _decode_cursor(req.cursor).get("offset", (req.page - 1) * req.page_size)
            else:
                base_offset = (req.page - 1) * req.page_size
            next_cursor = _encode_cursor({"type": "offset", "offset": base_offset + req.page_size})

    # Only compute total on first (non-cursor) page
    total: int | None = None
    if not req.cursor:
        try:
            total = query.count()
        except Exception:
            total = None

    result = MemberListResponse(
        success=True,
        message=f"Found {len(members_page)} members" + (f" of {total}" if total is not None else ""),
        data=[m.to_dict() for m in members_page],
        total=total,
        page=req.page if not req.cursor else None,
        page_size=req.page_size,
        next_cursor=next_cursor,
        has_more=has_more,
    )
    cache.set(cache_key, result.model_dump(), ttl=60)
    return result
