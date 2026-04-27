"""
Member Pydantic Schemas — Request/Response models for the Profile Service.
"""

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any


class MemberCreate(BaseModel):
    """Request body for creating a new member."""
    first_name: str = Field(..., min_length=1, max_length=100, description="First name")
    last_name: str = Field(..., min_length=1, max_length=100, description="Last name")
    email: str = Field(..., description="Email address (must be unique)")
    phone: Optional[str] = Field(None, max_length=20, description="Phone number")
    location_city: Optional[str] = Field(None, description="City")
    location_state: Optional[str] = Field(None, description="State/Province")
    location_country: Optional[str] = Field(None, description="Country")
    headline: Optional[str] = Field(None, max_length=500, description="Profile headline")
    about: Optional[str] = Field(None, description="About/Summary section")
    experience: Optional[List[Dict[str, Any]]] = Field(None, description="Work experience list")
    education: Optional[List[Dict[str, Any]]] = Field(None, description="Education list")
    skills: Optional[List[str]] = Field(None, description="List of skills")
    profile_photo_url: Optional[str] = Field(None, description="Profile photo URL")
    resume_text: Optional[str] = Field(None, description="Resume text content")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "first_name": "John",
                    "last_name": "Doe",
                    "email": "john.doe@example.com",
                    "phone": "+1-555-0100",
                    "location_city": "San Jose",
                    "location_state": "California",
                    "location_country": "USA",
                    "headline": "Senior Software Engineer at Google",
                    "about": "Passionate about building scalable systems...",
                    "experience": [
                        {"title": "Senior SWE", "company": "Google", "years": 3}
                    ],
                    "education": [
                        {"degree": "MS Computer Science", "school": "Stanford", "year": 2020}
                    ],
                    "skills": ["Python", "Java", "Kubernetes", "AWS"],
                    "resume_text": "Experienced software engineer with 8+ years..."
                }
            ]
        }
    }


class MemberGet(BaseModel):
    """Request body for getting a member profile."""
    member_id: int = Field(..., description="Member ID to retrieve")


class MemberUpdate(BaseModel):
    """Request body for updating member fields."""
    member_id: int = Field(..., description="Member ID to update")
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    location_city: Optional[str] = None
    location_state: Optional[str] = None
    location_country: Optional[str] = None
    headline: Optional[str] = None
    about: Optional[str] = None
    experience: Optional[List[Dict[str, Any]]] = None
    education: Optional[List[Dict[str, Any]]] = None
    skills: Optional[List[str]] = None
    profile_photo_url: Optional[str] = None
    resume_text: Optional[str] = None


class MemberDelete(BaseModel):
    """Request body for deleting a member."""
    member_id: int = Field(..., description="Member ID to delete")


class MemberSearch(BaseModel):
    """Request body for searching members."""
    keyword: Optional[str] = Field(None, description="Search keyword (name, headline, about) — uses full-text when available")
    skill: Optional[str] = Field(None, description="Filter by skill")
    location: Optional[str] = Field(None, description="Filter by city or state")
    sort_by: Optional[str] = Field(None, description="Sort order: 'id' (default), 'connections', 'recent'")
    # Offset pagination (backwards-compatible)
    page: int = Field(1, ge=1, description="Page number")
    page_size: int = Field(20, ge=1, le=100, description="Results per page")
    # Cursor-based pagination (takes precedence over page when provided)
    cursor: Optional[str] = Field(None, description="Opaque cursor returned from a previous response for keyset pagination")


class MemberResponse(BaseModel):
    """Standard member response."""
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None


class MemberListResponse(BaseModel):
    """Response for member list/search results."""
    success: bool
    message: str
    data: Optional[List[Dict[str, Any]]] = None
    total: Optional[int] = None
    page: Optional[int] = None
    page_size: Optional[int] = None
    # Cursor pagination extras (None when offset pagination used or no more results)
    next_cursor: Optional[str] = None
    has_more: Optional[bool] = None
