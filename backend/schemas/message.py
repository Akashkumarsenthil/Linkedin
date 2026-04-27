"""
Messaging Pydantic Schemas
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


class ThreadOpen(BaseModel):
    participant_ids: List[Dict[str, Any]] = Field(
        ...,
        description="List of participants, each with user_id and user_type (member/recruiter)"
    )
    subject: Optional[str] = Field(None, description="Thread subject line")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "participant_ids": [
                        {"user_id": 1, "user_type": "member"},
                        {"user_id": 1, "user_type": "recruiter"}
                    ],
                    "subject": "Regarding the Senior Backend Engineer position"
                }
            ]
        }
    }


class ThreadGet(BaseModel):
    thread_id: int


class ThreadsByUser(BaseModel):
    user_id: int
    user_type: str = Field("member", description="member or recruiter")
    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=100)


class MessageSend(BaseModel):
    thread_id: int
    sender_id: int
    sender_type: str = Field("member", description="member or recruiter")
    message_text: str = Field(..., min_length=1)
    client_message_id: Optional[str] = Field(
        None,
        description="Client-generated idempotency key for safe retries",
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "thread_id": 1,
                    "sender_id": 1,
                    "sender_type": "member",
                    "message_text": "Hi, I wanted to follow up on my application for the Backend Engineer role."
                }
            ]
        }
    }


class MessageList(BaseModel):
    thread_id: int
    viewer_id: Optional[int] = Field(None, description="Current viewer user_id (for read receipts)")
    viewer_type: Optional[str] = Field(None, description="Current viewer type: member or recruiter")
    mark_as_read: bool = Field(True, description="Mark unread messages as read for the viewer")
    page: int = Field(1, ge=1)
    page_size: int = Field(50, ge=1, le=200)


class UnreadSummaryRequest(BaseModel):
    user_id: int
    user_type: str = Field("member", description="member or recruiter")


class MessageResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None


class MessageListResponse(BaseModel):
    success: bool
    message: str
    data: Optional[List[Dict[str, Any]]] = None
    total: Optional[int] = None
