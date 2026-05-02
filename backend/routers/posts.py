"""
Feed Service — create, list, like, and delete user posts.
"""

import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc

from database import get_db
from models.post import Post, PostLike, PostComment
from models.member import Member
from models.recruiter import Recruiter
from auth import get_current_user, TokenPayload
from schemas.post import (
    PostCreate, PostFeedRequest, PostDelete, PostLikeRequest,
    PostResponse, PostListResponse,
    PostCommentCreate, PostCommentListRequest, PostCommentResponse
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
    
    # Filter logic: if author_id is provided, just filter by author_id (allow public profile viewing)
    if req.author_id is not None:
        q = q.filter(Post.author_id == req.author_id)
        if req.author_type:
            q = q.filter(Post.author_type == req.author_type)
    else:
        # Normal feed logic: own posts OR (if member) posts from accepted connections
        if current_user.user_type == "member":
            q = q.filter(
                ((Post.author_id == current_user.user_id) & (Post.author_type == current_user.user_type)) |
                ((Post.author_id.in_(conn_ids)) & (Post.author_type == "member"))
            )
        else:
            # Recruiters only see their own posts
            q = q.filter(Post.author_id == current_user.user_id, Post.author_type == current_user.user_type)

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

    # Check which posts are liked by the current user
    user_likes = {}
    post_ids = [p.post_id for p in posts]
    if posts:
        likes = db.query(PostLike).filter(
            PostLike.post_id.in_(post_ids),
            PostLike.user_id == current_user.user_id,
            PostLike.user_type == current_user.user_type
        ).all()
        for l in likes:
            user_likes[l.post_id] = l.reaction_type

    # Get reaction counts for all posts
    from sqlalchemy import func
    counts_query = db.query(PostLike.post_id, PostLike.reaction_type, func.count(PostLike.like_id)).filter(
        PostLike.post_id.in_(post_ids)
    ).group_by(PostLike.post_id, PostLike.reaction_type).all()
    
    post_reaction_stats = {}
    for pid, rtype, count in counts_query:
        if pid not in post_reaction_stats:
            post_reaction_stats[pid] = {}
        post_reaction_stats[pid][rtype] = count

    result = []
    for p in posts:
        item = p.to_dict()
        item["liked_by_me"] = p.post_id in user_likes
        item["active_reaction"] = user_likes.get(p.post_id)
        item["reaction_counts"] = post_reaction_stats.get(p.post_id, {})
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


# ── Single Post ──────────────────────────────────────────────────────────────

@router.get("/{post_id}", response_model=PostResponse, summary="Get a single post")
async def get_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    p = db.query(Post).filter(Post.post_id == post_id).first()
    if not p:
        return PostResponse(success=False, message="Post not found")
        
    author = _hydrate_author(db, p.author_id, p.author_type)
    
    like = db.query(PostLike).filter(
        PostLike.post_id == post_id,
        PostLike.user_id == current_user.user_id,
        PostLike.user_type == current_user.user_type
    ).first()
    
    from sqlalchemy import func
    counts = db.query(PostLike.reaction_type, func.count(PostLike.like_id)).filter(PostLike.post_id == post_id).group_by(PostLike.reaction_type).all()
    reaction_counts = {r: c for r, c in counts}
    
    item = p.to_dict()
    item["liked_by_me"] = like is not None
    item["active_reaction"] = like.reaction_type if like else None
    item["reaction_counts"] = reaction_counts
    item["author"] = author
    
    return PostResponse(success=True, message="Post retrieved", data=item)


# ── Like (toggle) ────────────────────────────────────────────────────────────

@router.post("/like", response_model=PostResponse, summary="Toggle a reaction on a post")
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

    reaction_type = req.reaction_type or "like"

    if existing:
        if existing.reaction_type == reaction_type:
            # Same type? Toggle off
            db.delete(existing)
            post.likes_count = max(0, (post.likes_count or 0) - 1)
            liked = False
            active_reaction = None
        else:
            # Different type? Switch it
            existing.reaction_type = reaction_type
            liked = True
            active_reaction = reaction_type
    else:
        db.add(PostLike(
            post_id=req.post_id,
            user_id=current_user.user_id,
            user_type=current_user.user_type,
            reaction_type=reaction_type
        ))
        post.likes_count = (post.likes_count or 0) + 1
        liked = True
        active_reaction = reaction_type
    
    db.commit()
    db.refresh(post)

    # Get reaction summary
    from sqlalchemy import func
    counts = db.query(PostLike.reaction_type, func.count(PostLike.like_id)).filter(PostLike.post_id == post.post_id).group_by(PostLike.reaction_type).all()
    reaction_counts = {r: c for r, c in counts}

    return PostResponse(
        success=True,
        message="Reaction updated",
        data={
            **post.to_dict(), 
            "liked_by_me": liked, 
            "active_reaction": active_reaction,
            "reaction_counts": reaction_counts
        },
    )

@router.get("/{post_id}/reactions", response_model=PostResponse, summary="List users who reacted to a post")
async def list_reactions(
    post_id: int,
    type: str = None,
    db: Session = Depends(get_db),
):
    q = db.query(PostLike).filter(PostLike.post_id == post_id)
    if type and type != "all":
        q = q.filter(PostLike.reaction_type == type)
    
    likes = q.order_by(desc(PostLike.created_at)).all()
    
    result = []
    for l in likes:
        author = _hydrate_author(db, l.user_id, l.user_type)
        item = l.to_dict()
        item["user"] = author
        result.append(item)
    
    return PostResponse(success=True, message=f"Found {len(result)} reactions", data={"reactions": result})


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
    db.query(PostComment).filter(PostComment.post_id == req.post_id).delete()
    db.delete(post)
    db.commit()
    return PostResponse(success=True, message="Post deleted")


# ── Comments ──────────────────────────────────────────────────────────────────

@router.post("/comments/add", response_model=PostCommentResponse, summary="Add a comment")
async def add_comment(
    req: PostCommentCreate,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    post = db.query(Post).filter(Post.post_id == req.post_id).first()
    if not post:
        return PostCommentResponse(success=False, message="Post not found")

    comment = PostComment(
        post_id=req.post_id,
        author_id=current_user.user_id,
        author_type=current_user.user_type,
        content=req.content,
    )
    db.add(comment)
    post.comments_count = (post.comments_count or 0) + 1
    db.commit()
    db.refresh(comment)

    # Hydrate author for response
    author = _hydrate_author(db, comment.author_id, comment.author_type)
    data = comment.to_dict()
    data["author_name"] = author["name"]
    data["author_photo_url"] = author["photo_url"]

    return PostCommentResponse(success=True, message="Comment added", data=data)


@router.post("/comments/list", response_model=PostCommentResponse, summary="List comments")
async def list_comments(
    req: PostCommentListRequest,
    db: Session = Depends(get_db),
):
    q = db.query(PostComment).filter(PostComment.post_id == req.post_id).order_by(PostComment.created_at.desc())
    
    total = q.count()
    offset = (req.page - 1) * req.page_size
    comments = q.offset(offset).limit(req.page_size).all()
    
    result = []
    for c in comments:
        author = _hydrate_author(db, c.author_id, c.author_type)
        item = c.to_dict()
        item["author_name"] = author["name"]
        item["author_photo_url"] = author["photo_url"]
        result.append(item)

    return PostCommentResponse(success=True, message=f"Found {len(result)} comments", data={
        "comments": result,
        "total": total,
        "page": req.page,
        "has_more": total > (offset + len(result))
    })
