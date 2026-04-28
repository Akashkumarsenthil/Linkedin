"""
Application Pydantic Schemas
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


class ApplicationSubmit(BaseModel):
    job_id: int = Field(..., description="Job to apply for")
    member_id: int = Field(..., description="Applicant member ID")
    resume_url: Optional[str] = None
    resume_text: Optional[str] = None
    cover_letter: Optional[str] = None
    answers: Optional[Dict[str, Any]] = Field(None, description="Custom question answers")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "job_id": 1,
                    "member_id": 1,
                    "resume_text": "Experienced software engineer with expertise in Python, FastAPI...",
                    "cover_letter": "I am excited to apply for the Senior Backend Engineer position...",
                    "answers": {"years_experience": "5+", "willing_to_relocate": "yes"}
                }
            ]
        }
    }


class ApplicationGet(BaseModel):
    application_id: int


class ApplicationByJob(BaseModel):
    job_id: int
    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=100)


class ApplicationByMember(BaseModel):
    member_id: int
    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=100)


class ApplicationUpdateStatus(BaseModel):
    application_id: int
    status: str = Field(..., description="New status: submitted, reviewing, rejected, interview, offer")


class ApplicationAddNote(BaseModel):
    application_id: int
    note: str = Field(..., description="Recruiter note or decision rationale")


class ApplicationResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None


class ApplicationListResponse(BaseModel):
    success: bool
    message: str
    data: Optional[List[Dict[str, Any]]] = None
    total: Optional[int] = None
    page: Optional[int] = None
    page_size: Optional[int] = None
