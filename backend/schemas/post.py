"""Post Pydantic schemas — request/response models for the feed service."""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


class PostCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=5000, description="Post body text")
    image_url: Optional[str] = Field(None, description="Optional inline image (data URL) or http URL")


class PostFeedRequest(BaseModel):
    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=50)
    author_id: Optional[int] = Field(None, description="Restrict feed to this author")
    author_type: Optional[str] = Field(None, description="'member' or 'recruiter'")


class PostDelete(BaseModel):
    post_id: int


class PostLikeRequest(BaseModel):
    post_id: int


class PostResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None


class PostListResponse(BaseModel):
    success: bool
    message: str
    data: Optional[List[Dict[str, Any]]] = None
    total: Optional[int] = None
    page: Optional[int] = None
    page_size: Optional[int] = None
