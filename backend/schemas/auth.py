"""Auth request/response schemas."""

from pydantic import BaseModel, Field
from typing import Optional


class LoginRequest(BaseModel):
    email: str = Field(..., description="Account email address")
    password: str = Field(..., min_length=6, description="Password (min 6 characters)")

    model_config = {
        "json_schema_extra": {
            "examples": [{"email": "jane@example.com", "password": "secret123"}]
        }
    }


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_type: str
    user_id: int
    email: str


class RegisterMemberRequest(BaseModel):
    email: str
    password: str = Field(..., min_length=6)
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    headline: Optional[str] = None
    location_city: Optional[str] = None
    location_state: Optional[str] = None

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "email": "jane@example.com",
                    "password": "secret123",
                    "first_name": "Jane",
                    "last_name": "Smith",
                    "headline": "ML Engineer",
                }
            ]
        }
    }


class RegisterRecruiterRequest(BaseModel):
    email: str
    password: str = Field(..., min_length=6)
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    company_name: Optional[str] = None
    company_industry: Optional[str] = None

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "email": "recruiter@acme.com",
                    "password": "secret123",
                    "first_name": "Bob",
                    "last_name": "Hiring",
                    "company_name": "Acme Corp",
                }
            ]
        }
    }


class MeResponse(BaseModel):
    user_type: str
    user_id: int
    email: str
    profile: dict
