"""
Connection Pydantic Schemas
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


class ConnectionRequest(BaseModel):
    requester_id: int = Field(..., description="Member sending the request")
    receiver_id: int = Field(..., description="Member receiving the request")

    model_config = {
        "json_schema_extra": {
            "examples": [{"requester_id": 1, "receiver_id": 2}]
        }
    }


class ConnectionAccept(BaseModel):
    connection_id: int = Field(..., description="Connection request ID to accept")


class ConnectionReject(BaseModel):
    connection_id: int = Field(..., description="Connection request ID to reject")


class ConnectionList(BaseModel):
    user_id: int = Field(..., description="Member ID")
    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=100)


class PendingConnections(BaseModel):
    user_id: int = Field(..., description="Member ID")
    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=100)


class MutualConnections(BaseModel):
    user_id: int = Field(..., description="First member ID")
    other_id: int = Field(..., description="Second member ID")


class ConnectionResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None


class ConnectionListResponse(BaseModel):
    success: bool
    message: str
    data: Optional[List[Dict[str, Any]]] = None
    total: Optional[int] = None
