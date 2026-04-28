"""
Notifications Service — aggregated "bell" feed for the signed-in user.

Pulls from a few existing tables (pending connection requests, recent post
likes, recent posts from the user's connections) and returns a unified list
that the web UI can render in a dropdown / notifications tab.
"""

import logging
from typing import List, Dict, Any
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc

from database import get_db
from models.connection import Connection
from models.member import Member
from models.post import Post, PostLike
from auth import get_current_user, TokenPayload

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/notifications", tags=["Notifications Service"])


class NotificationsResponse(BaseModel):
    success: bool
    message: str
    unread_count: int = 0
    data: List[Dict[str, Any]] = []


def _iso(ts) -> str | None:
    return str(ts) if ts else None


@router.post("/list", response_model=NotificationsResponse, summary="Recent notifications for the signed-in user")
async def list_notifications(
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """Return a chronologically sorted list of actionable notifications.

    Currently surfaces:
      1. Pending **connection requests** sent to me (actionable).
      2. Recent **likes** on my posts (by other users).
      3. Recent **posts** authored by my accepted connections.

    The `unread_count` is intentionally conservative: only the actionable
    items (#1) count as "unread" so the badge clears when the user handles
    the requests.
    """
    notifications: List[Dict[str, Any]] = []

    user_id = current_user.user_id
    is_member = current_user.user_type == "member"

    # ── 1. Pending connection requests (members only) ───────────────────────
    pending_count = 0
    if is_member:
        pending = (
            db.query(Connection)
            .filter(
                Connection.receiver_id == user_id,
                Connection.status == "pending",
            )
            .order_by(desc(Connection.created_at))
            .limit(10)
            .all()
        )
        requester_ids = [c.requester_id for c in pending]
        requesters = {}
        if requester_ids:
            for m in db.query(Member).filter(Member.member_id.in_(requester_ids)).all():
                requesters[m.member_id] = m

        for c in pending:
            req_m = requesters.get(c.requester_id)
            actor_name = (
                f"{req_m.first_name} {req_m.last_name}".strip()
                if req_m else f"Member #{c.requester_id}"
            )
            notifications.append({
                "id": f"conn-{c.connection_id}",
                "type": "connection_request",
                "title": f"{actor_name} wants to connect with you",
                "subtitle": req_m.headline if req_m and req_m.headline else None,
                "actor_id": c.requester_id,
                "actor_type": "member",
                "actor_photo_url": req_m.profile_photo_url if req_m else None,
                "created_at": _iso(c.created_at),
                "unread": True,
            })
            pending_count += 1

    # ── 2. Recent likes on my posts ─────────────────────────────────────────
    my_post_ids = [
        p.post_id
        for p in db.query(Post.post_id)
        .filter(
            Post.author_id == user_id,
            Post.author_type == current_user.user_type,
        )
        .all()
    ]
    if my_post_ids:
        recent_likes = (
            db.query(PostLike)
            .filter(
                PostLike.post_id.in_(my_post_ids),
                # Don't notify me about my own likes
                ~((PostLike.user_id == user_id) & (PostLike.user_type == current_user.user_type)),
            )
            .order_by(desc(PostLike.created_at))
            .limit(10)
            .all()
        )
        liker_ids = list({l.user_id for l in recent_likes if l.user_type == "member"})
        likers = {}
        if liker_ids:
            for m in db.query(Member).filter(Member.member_id.in_(liker_ids)).all():
                likers[m.member_id] = m

        for l in recent_likes:
            liker = likers.get(l.user_id)
            actor_name = (
                f"{liker.first_name} {liker.last_name}".strip()
                if liker else f"User #{l.user_id}"
            )
            notifications.append({
                "id": f"like-{l.like_id}",
                "type": "post_like",
                "title": f"{actor_name} liked your post",
                "subtitle": None,
                "actor_id": l.user_id,
                "actor_type": l.user_type,
                "actor_photo_url": liker.profile_photo_url if liker else None,
                "post_id": l.post_id,
                "created_at": _iso(l.created_at),
                "unread": False,
            })

    # ── 3. Recent posts by my accepted connections ─────────────────────────
    if is_member:
        my_conns = (
            db.query(Connection)
            .filter(
                or_(
                    Connection.requester_id == user_id,
                    Connection.receiver_id == user_id,
                ),
                Connection.status == "accepted",
            )
            .all()
        )
        friend_ids = []
        for c in my_conns:
            friend_ids.append(
                c.receiver_id if c.requester_id == user_id else c.requester_id
            )

        if friend_ids:
            friend_posts = (
                db.query(Post)
                .filter(
                    Post.author_type == "member",
                    Post.author_id.in_(friend_ids),
                )
                .order_by(desc(Post.created_at))
                .limit(5)
                .all()
            )
            friend_authors = {}
            if friend_posts:
                ids = list({p.author_id for p in friend_posts})
                for m in db.query(Member).filter(Member.member_id.in_(ids)).all():
                    friend_authors[m.member_id] = m

            for p in friend_posts:
                author = friend_authors.get(p.author_id)
                actor_name = (
                    f"{author.first_name} {author.last_name}".strip()
                    if author else f"Member #{p.author_id}"
                )
                preview = (p.content or "").strip().replace("\n", " ")
                if len(preview) > 90:
                    preview = preview[:90] + "…"
                notifications.append({
                    "id": f"post-{p.post_id}",
                    "type": "connection_post",
                    "title": f"{actor_name} shared a new post",
                    "subtitle": preview,
                    "actor_id": p.author_id,
                    "actor_type": "member",
                    "actor_photo_url": author.profile_photo_url if author else None,
                    "post_id": p.post_id,
                    "created_at": _iso(p.created_at),
                    "unread": False,
                })

    # Sort newest first, cap at 30 items
    notifications.sort(key=lambda n: (n.get("created_at") or ""), reverse=True)
    notifications = notifications[:30]

    return NotificationsResponse(
        success=True,
        message=f"{len(notifications)} notifications",
        unread_count=pending_count,
        data=notifications,
    )
