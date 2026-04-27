"""
Recruiter Pydantic Schemas
"""

from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List


class RecruiterCreate(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    email: str = Field(..., description="Unique email address")
    phone: Optional[str] = None
    company_id: Optional[int] = None
    company_name: Optional[str] = None
    company_industry: Optional[str] = None
    company_size: Optional[str] = None
    role: Optional[str] = "recruiter"
    access_level: Optional[str] = "standard"

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "first_name": "Sarah",
                    "last_name": "Johnson",
                    "email": "sarah.johnson@techcorp.com",
                    "phone": "+1-555-0200",
                    "company_name": "TechCorp Inc.",
                    "company_industry": "Technology",
                    "company_size": "1000-5000",
                    "role": "senior_recruiter",
                    "access_level": "admin"
                }
            ]
        }
    }


class RecruiterGet(BaseModel):
    recruiter_id: int = Field(..., description="Recruiter ID")


class RecruiterUpdate(BaseModel):
    recruiter_id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    company_name: Optional[str] = None
    company_industry: Optional[str] = None
    company_size: Optional[str] = None
    role: Optional[str] = None
    access_level: Optional[str] = None


class RecruiterDelete(BaseModel):
    recruiter_id: int


class RecruiterResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None


class RecruiterListResponse(BaseModel):
    success: bool
    message: str
    data: Optional[List[Dict[str, Any]]] = None
