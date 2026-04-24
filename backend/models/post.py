"""
Post SQLAlchemy Model — user-authored feed posts (LinkedIn-style).
"""

from sqlalchemy import Column, Integer, String, Text, TIMESTAMP, Index
from sqlalchemy.dialects.mysql import MEDIUMTEXT
from sqlalchemy.sql import func
from database import Base


class Post(Base):
    """A single feed post written by a member or recruiter.

    Post images are stored inline as base64 data URLs (MEDIUMTEXT, up to 16 MB)
    to keep the demo self-contained and avoid a separate object store.
    """

    __tablename__ = "posts"

    post_id = Column(Integer, primary_key=True, autoincrement=True)
    author_id = Column(Integer, nullable=False, index=True)
    author_type = Column(String(20), nullable=False)  # 'member' | 'recruiter'
    content = Column(Text, nullable=False)
    image_url = Column(MEDIUMTEXT)  # optional; data URL or http URL
    likes_count = Column(Integer, default=0, nullable=False)
    comments_count = Column(Integer, default=0, nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now(), index=True)

    __table_args__ = (
        Index("idx_posts_author", "author_type", "author_id"),
        Index("idx_posts_created_desc", "created_at"),
    )

    def to_dict(self):
        return {
            "post_id": self.post_id,
            "author_id": self.author_id,
            "author_type": self.author_type,
            "content": self.content,
            "image_url": self.image_url,
            "likes_count": self.likes_count or 0,
            "comments_count": self.comments_count or 0,
            "created_at": str(self.created_at) if self.created_at else None,
        }


class PostLike(Base):
    """Tracks which user liked which post, so likes are idempotent per user."""

    __tablename__ = "post_likes"

    like_id = Column(Integer, primary_key=True, autoincrement=True)
    post_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, nullable=False)
    user_type = Column(String(20), nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now())

    __table_args__ = (
        Index("uq_post_like", "post_id", "user_type", "user_id", unique=True),
    )
