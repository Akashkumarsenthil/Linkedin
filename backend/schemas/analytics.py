"""
Analytics Pydantic Schemas
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


class EventIngest(BaseModel):
    event_type: str = Field(..., description="Type: job.viewed, job.saved, application.submitted, etc.")
    actor_id: str = Field(..., description="Member or recruiter ID performing the action")
    entity_type: str = Field(..., description="Entity type: job, application, thread, connection")
    entity_id: str = Field(..., description="Entity ID")
    payload: Optional[Dict[str, Any]] = Field(None, description="Additional event data")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "event_type": "job.viewed",
                    "actor_id": "42",
                    "entity_type": "job",
                    "entity_id": "101",
                    "payload": {"source": "search_results", "session_id": "abc123"}
                }
            ]
        }
    }


class TopJobsRequest(BaseModel):
    metric: str = Field("applications", description="Metric: applications, views, saves")
    limit: int = Field(10, ge=1, le=50)
    window_days: int = Field(30, ge=1, le=365, description="Look-back window in days")


class FunnelRequest(BaseModel):
    job_id: int
    window_days: int = Field(30, ge=1, le=365)


class GeoRequest(BaseModel):
    job_id: int
    window_days: int = Field(30, ge=1, le=365)


class MemberDashboardRequest(BaseModel):
    member_id: int


class LeastAppliedRequest(BaseModel):
    limit: int = Field(5, ge=1, le=20)
    window_days: int = Field(90, ge=1, le=365, description="Look-back window in days")


class SavesTrendRequest(BaseModel):
    window_days: int = Field(30, ge=1, le=365, description="Look-back window in days")
    granularity: str = Field("day", description="Grouping: day or week")


class ClicksPerJobRequest(BaseModel):
    limit: int = Field(10, ge=1, le=50)
    window_days: int = Field(30, ge=1, le=365)


class AnalyticsResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Any] = None
