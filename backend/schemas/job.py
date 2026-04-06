"""
Job Posting Pydantic Schemas
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


class JobCreate(BaseModel):
    recruiter_id: int = Field(..., description="ID of the recruiter posting the job")
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    company_id: Optional[int] = None
    seniority_level: Optional[str] = Field(None, description="e.g., Entry, Mid, Senior, Director")
    employment_type: Optional[str] = Field(None, description="e.g., Full-time, Part-time, Contract, Internship")
    location: Optional[str] = None
    work_mode: Optional[str] = Field("onsite", description="remote, hybrid, or onsite")
    skills_required: Optional[List[str]] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "recruiter_id": 1,
                    "title": "Senior Backend Engineer",
                    "description": "We are looking for an experienced backend engineer to join our platform team...",
                    "seniority_level": "Senior",
                    "employment_type": "Full-time",
                    "location": "San Francisco, CA",
                    "work_mode": "hybrid",
                    "skills_required": ["Python", "FastAPI", "PostgreSQL", "Kafka"],
                    "salary_min": 150000,
                    "salary_max": 220000
                }
            ]
        }
    }


class JobGet(BaseModel):
    job_id: int = Field(..., description="Job ID to retrieve")


class JobUpdate(BaseModel):
    job_id: int
    title: Optional[str] = None
    description: Optional[str] = None
    seniority_level: Optional[str] = None
    employment_type: Optional[str] = None
    location: Optional[str] = None
    work_mode: Optional[str] = None
    skills_required: Optional[List[str]] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None


class JobSearch(BaseModel):
    keyword: Optional[str] = Field(None, description="Search in title and description (uses full-text when available)")
    location: Optional[str] = None
    employment_type: Optional[str] = None
    work_mode: Optional[str] = None
    seniority_level: Optional[str] = None
    skills: Optional[List[str]] = Field(None, description="Filter by required skills")
    salary_min: Optional[int] = Field(None, description="Minimum salary filter — matches jobs whose salary_max >= this value")
    salary_max: Optional[int] = Field(None, description="Maximum salary filter — matches jobs whose salary_min <= this value")
    sort_by: Optional[str] = Field(None, description="Sort order: 'date' (default), 'applicants', 'views'")
    # Offset pagination (backwards-compatible)
    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=100)
    # Cursor-based pagination (takes precedence over page when provided)
    cursor: Optional[str] = Field(None, description="Opaque cursor returned from a previous response for keyset pagination")


class JobClose(BaseModel):
    job_id: int = Field(..., description="Job ID to close")


class JobByRecruiter(BaseModel):
    recruiter_id: int = Field(..., description="Recruiter ID")
    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=100)


class SaveJobRequest(BaseModel):
    member_id: int
    job_id: int


class JobResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None


class JobListResponse(BaseModel):
    success: bool
    message: str
    data: Optional[List[Dict[str, Any]]] = None
    total: Optional[int] = None
    page: Optional[int] = None
    page_size: Optional[int] = None
    # Cursor pagination extras (None when offset pagination used or no more results)
    next_cursor: Optional[str] = None
    has_more: Optional[bool] = None
