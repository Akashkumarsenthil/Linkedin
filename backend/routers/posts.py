"""
Feed Service — create, list, like, and delete user posts.
"""

import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc

from database import get_db
from models.post import Post, PostLike
from models.member import Member
from models.recruiter import Recruiter
from auth import get_current_user, TokenPayload
from schemas.post import (
    PostCreate, PostFeedRequest, PostDelete, PostLikeRequest,
    PostResponse, PostListResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/posts", tags=["Feed Service"])


# ── Author enrichment ────────────────────────────────────────────────────────

def _hydrate_author(db: Session, author_id: int, author_type: str) -> dict:
    """Return a minimal author snapshot for feed display."""
    if author_type == "member":
        m = db.query(Member).filter(Member.member_id == author_id).first()
        if not m:
            return {"name": "Unknown member", "headline": None, "photo_url": None}
        return {
            "name": f"{m.first_name} {m.last_name}".strip(),
            "headline": m.headline,
            "photo_url": m.profile_photo_url,
            "location": ", ".join([p for p in [m.location_city, m.location_state] if p]) or None,
        }
    r = db.query(Recruiter).filter(Recruiter.recruiter_id == author_id).first()
    if not r:
        return {"name": "Unknown recruiter", "headline": None, "photo_url": None}
    return {
        "name": f"{r.first_name} {r.last_name}".strip(),
        "headline": r.company_name or r.role or "Recruiter",
        "photo_url": None,
        "location": None,
    }


# ── Create ───────────────────────────────────────────────────────────────────

@router.post("/create", response_model=PostResponse, summary="Create a new feed post")
async def create_post(
    req: PostCreate,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """Any signed-in user (member or recruiter) can create a post."""
    post = Post(
        author_id=current_user.user_id,
        author_type=current_user.user_type,
        content=req.content,
        image_url=req.image_url,
    )
    db.add(post)
    db.commit()
    db.refresh(post)

    data = post.to_dict()
    data["author"] = _hydrate_author(db, post.author_id, post.author_type)
    data["liked_by_me"] = False
    logger.info(f"User {current_user.user_type}#{current_user.user_id} created post {post.post_id}")
    return PostResponse(success=True, message="Post created", data=data)


# ── Feed ─────────────────────────────────────────────────────────────────────

@router.post("/feed", response_model=PostListResponse, summary="List recent posts")
async def list_feed(
    req: PostFeedRequest,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """Return posts newest-first, filtered by connections and own posts."""
    q = db.query(Post)

    # Get user's accepted connections (assuming member-to-member connections)
    from models.connection import Connection
    conns = db.query(Connection).filter(
        (Connection.status == "accepted") &
        ((Connection.requester_id == current_user.user_id) | (Connection.receiver_id == current_user.user_id))
    ).all()
    conn_ids = [c.receiver_id if c.requester_id == current_user.user_id else c.requester_id for c in conns]
    
    # Filter logic: own posts OR (if member) posts from accepted connections
    if current_user.user_type == "member":
        q = q.filter(
            ((Post.author_id == current_user.user_id) & (Post.author_type == current_user.user_type)) |
            ((Post.author_id.in_(conn_ids)) & (Post.author_type == "member"))
        )
    else:
        # Recruiters only see their own posts
        q = q.filter(Post.author_id == current_user.user_id, Post.author_type == current_user.user_type)

    if req.author_id is not None:
        q = q.filter(Post.author_id == req.author_id)
    if req.author_type:
        q = q.filter(Post.author_type == req.author_type)

    total = q.count()
    offset = (req.page - 1) * req.page_size
    posts = (
        q.order_by(desc(Post.created_at), desc(Post.post_id))
        .offset(offset)
        .limit(req.page_size)
        .all()
    )

    # Pre-fetch authors to avoid N+1
    by_member = {}
    by_recruiter = {}
    for p in posts:
        if p.author_type == "member":
            by_member[p.author_id] = None
        else:
            by_recruiter[p.author_id] = None

    if by_member:
        for m in db.query(Member).filter(Member.member_id.in_(by_member.keys())).all():
            by_member[m.member_id] = m
    if by_recruiter:
        for r in db.query(Recruiter).filter(Recruiter.recruiter_id.in_(by_recruiter.keys())).all():
            by_recruiter[r.recruiter_id] = r

    result = []
    for p in posts:
        item = p.to_dict()
        if p.author_type == "member":
            m = by_member.get(p.author_id)
            item["author"] = {
                "name": f"{m.first_name} {m.last_name}".strip() if m else "Unknown",
                "headline": m.headline if m else None,
                "photo_url": m.profile_photo_url if m else None,
                "location": ", ".join([x for x in [m.location_city, m.location_state] if x]) if m else None,
            }
        else:
            r = by_recruiter.get(p.author_id)
            item["author"] = {
                "name": f"{r.first_name} {r.last_name}".strip() if r else "Unknown",
                "headline": (r.company_name or r.role) if r else None,
                "photo_url": None,
                "location": None,
            }
        result.append(item)

    return PostListResponse(
        success=True,
        message=f"Found {len(result)} posts of {total}",
        data=result,
        total=total,
        page=req.page,
        page_size=req.page_size,
    )


# ── Like (toggle) ────────────────────────────────────────────────────────────

@router.post("/like", response_model=PostResponse, summary="Toggle a like on a post")
async def toggle_like(
    req: PostLikeRequest,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    post = db.query(Post).filter(Post.post_id == req.post_id).first()
    if not post:
        return PostResponse(success=False, message=f"Post {req.post_id} not found")

    existing = db.query(PostLike).filter(
        PostLike.post_id == req.post_id,
        PostLike.user_id == current_user.user_id,
        PostLike.user_type == current_user.user_type,
    ).first()

    if existing:
        db.delete(existing)
        post.likes_count = max(0, (post.likes_count or 0) - 1)
        liked = False
    else:
        db.add(PostLike(
            post_id=req.post_id,
            user_id=current_user.user_id,
            user_type=current_user.user_type,
        ))
        post.likes_count = (post.likes_count or 0) + 1
        liked = True
    db.commit()
    db.refresh(post)

    return PostResponse(
        success=True,
        message="Liked" if liked else "Unliked",
        data={**post.to_dict(), "liked_by_me": liked},
    )


# ── Delete (own posts only) ──────────────────────────────────────────────────

@router.post("/delete", response_model=PostResponse, summary="Delete your own post")
async def delete_post(
    req: PostDelete,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    post = db.query(Post).filter(Post.post_id == req.post_id).first()
    if not post:
        return PostResponse(success=False, message=f"Post {req.post_id} not found")
    if post.author_id != current_user.user_id or post.author_type != current_user.user_type:
        return PostResponse(success=False, message="You can only delete your own posts")

    db.query(PostLike).filter(PostLike.post_id == req.post_id).delete()
    db.delete(post)
    db.commit()
    return PostResponse(success=True, message="Post deleted")
