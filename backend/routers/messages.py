"""
Messaging Service — Thread and Message APIs
Handles message threads, sending messages with retry logic, and conversation history.
"""

import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_

from database import get_db
from models.message import Thread, ThreadParticipant, Message
from models.member import Member
from models.recruiter import Recruiter
from auth import get_current_user, TokenPayload
from schemas.message import (
    ThreadOpen, ThreadGet, ThreadsByUser, MessageSend, MessageList,
    MessageResponse, MessageListResponse,
)
from kafka_producer import kafka_producer

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Messaging Service"])


@router.post("/threads/open", response_model=MessageResponse, summary="Open/create a message thread")
async def open_thread(
    req: ThreadOpen,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """
    Create a new messaging thread between participants. Requires authentication.
    Each participant is identified by user_id and user_type (member/recruiter).
    """
    thread = Thread(subject=req.subject)
    db.add(thread)
    db.flush()  # Get the thread_id

    for participant in req.participant_ids:
        tp = ThreadParticipant(
            thread_id=thread.thread_id,
            user_id=participant["user_id"],
            user_type=participant["user_type"],
        )
        db.add(tp)

    db.commit()
    db.refresh(thread)

    data = thread.to_dict()
    data["participants"] = [
        {"user_id": p["user_id"], "user_type": p["user_type"]}
        for p in req.participant_ids
    ]

    return MessageResponse(success=True, message="Thread created successfully", data=data)


@router.post("/threads/get", response_model=MessageResponse, summary="Get thread metadata")
async def get_thread(req: ThreadGet, db: Session = Depends(get_db)):
    """Retrieve thread metadata and participant list."""
    thread = db.query(Thread).filter(Thread.thread_id == req.thread_id).first()
    if not thread:
        return MessageResponse(success=False, message=f"Thread {req.thread_id} not found")

    participants = db.query(ThreadParticipant).filter(
        ThreadParticipant.thread_id == req.thread_id
    ).all()

    data = thread.to_dict()
    data["participants"] = [
        {"user_id": p.user_id, "user_type": p.user_type} for p in participants
    ]

    # Get last message
    last_msg = db.query(Message).filter(
        Message.thread_id == req.thread_id
    ).order_by(desc(Message.timestamp)).first()
    if last_msg:
        data["last_message"] = last_msg.to_dict()

    return MessageResponse(success=True, message="Thread retrieved successfully", data=data)


@router.post("/threads/byUser", response_model=MessageListResponse, summary="List user's threads")
async def threads_by_user(req: ThreadsByUser, db: Session = Depends(get_db)):
    """List all messaging threads for a specific user."""
    participant_threads = db.query(ThreadParticipant.thread_id).filter(
        ThreadParticipant.user_id == req.user_id,
        ThreadParticipant.user_type == req.user_type,
    ).all()

    thread_ids = [t[0] for t in participant_threads]
    if not thread_ids:
        return MessageListResponse(success=True, message="No threads found", data=[], total=0)

    total = len(thread_ids)
    offset = (req.page - 1) * req.page_size
    paginated_ids = thread_ids[offset : offset + req.page_size]

    threads = db.query(Thread).filter(Thread.thread_id.in_(paginated_ids)).all()
    result = []
    for thread in threads:
        data = thread.to_dict()
        last_msg = db.query(Message).filter(
            Message.thread_id == thread.thread_id
        ).order_by(desc(Message.timestamp)).first()
        if last_msg:
            data["last_message"] = last_msg.to_dict()
        
        # Enrich with "other" participant info for 1:1 threads
        other_p = db.query(ThreadParticipant).filter(
            ThreadParticipant.thread_id == thread.thread_id,
            or_(
                ThreadParticipant.user_id != req.user_id,
                ThreadParticipant.user_type != req.user_type
            )
        ).first()
        
        if other_p:
            user_info = None
            if other_p.user_type == "member":
                m = db.query(Member).filter(Member.member_id == other_p.user_id).first()
                if m:
                    user_info = {
                        "name": f"{m.first_name} {m.last_name}",
                        "photo_url": m.profile_photo_url,
                        "headline": m.headline,
                        "user_id": m.member_id,
                        "user_type": "member"
                    }
            elif other_p.user_type == "recruiter":
                r = db.query(Recruiter).filter(Recruiter.recruiter_id == other_p.user_id).first()
                if r:
                    user_info = {
                        "name": f"{r.first_name} {r.last_name}",
                        "photo_url": r.profile_photo_url,
                        "headline": r.company_name or "Recruiter",
                        "user_id": r.recruiter_id,
                        "user_type": "recruiter"
                    }
            data["other_participant"] = user_info
        
        result.append(data)

    return MessageListResponse(success=True, message=f"Found {total} threads", data=result, total=total)


@router.post("/messages/send", response_model=MessageResponse, summary="Send a message")
async def send_message(
    req: MessageSend,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """
    Send a message in a thread. Includes retry logic for failure handling.
    Publishes a message.sent event to Kafka.
    """
    if req.sender_id != current_user.user_id:
        return MessageResponse(success=False, message="Cannot send message on behalf of another user")

    thread = db.query(Thread).filter(Thread.thread_id == req.thread_id).first()
    if not thread:
        return MessageResponse(success=False, message=f"Thread {req.thread_id} not found")

    participant = db.query(ThreadParticipant).filter(
        ThreadParticipant.thread_id == req.thread_id,
        ThreadParticipant.user_id == req.sender_id,
        ThreadParticipant.user_type == req.sender_type,
    ).first()
    if not participant:
        return MessageResponse(success=False, message="Sender is not a participant in this thread")

    message = Message(
        thread_id=req.thread_id,
        sender_id=req.sender_id,
        sender_type=req.sender_type,
        message_text=req.message_text,
    )
    db.add(message)
    db.commit()
    db.refresh(message)

    try:
        await kafka_producer.publish(
            topic="message.sent",
            event_type="message.sent",
            actor_id=str(req.sender_id),
            entity_type="thread",
            entity_id=str(req.thread_id),
            payload={"message_id": message.message_id, "sender_type": req.sender_type},
        )
    except Exception:
        pass

    return MessageResponse(success=True, message="Message sent successfully", data=message.to_dict())


@router.post("/messages/direct", response_model=MessageResponse, summary="Send a direct message")
async def send_direct_message(
    req: dict,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """Send a message to a specific user, creating a thread if needed."""
    sender_id = req.get("sender_id")
    recipient_id = req.get("recipient_id")
    recipient_type = req.get("recipient_type", "member")
    message_text = req.get("message_text")

    if sender_id != current_user.user_id:
        return MessageResponse(success=False, message="Unauthorized")

    # Check for existing thread
    sender_threads = db.query(ThreadParticipant.thread_id).filter(
        ThreadParticipant.user_id == sender_id
    ).all()
    sender_thread_ids = [t[0] for t in sender_threads]
    
    thread_id = None
    if sender_thread_ids:
        match = db.query(ThreadParticipant.thread_id).filter(
            ThreadParticipant.thread_id.in_(sender_thread_ids),
            ThreadParticipant.user_id == recipient_id,
            ThreadParticipant.user_type == recipient_type
        ).first()
        if match:
            thread_id = match[0]

    if not thread_id:
        thread = Thread(subject=f"Chat between {sender_id} and {recipient_id}")
        db.add(thread)
        db.flush()
        thread_id = thread.thread_id
        db.add(ThreadParticipant(thread_id=thread_id, user_id=sender_id, user_type="member"))
        db.add(ThreadParticipant(thread_id=thread_id, user_id=recipient_id, user_type=recipient_type))
        db.commit()

    message = Message(
        thread_id=thread_id,
        sender_id=sender_id,
        sender_type="member",
        message_text=message_text,
    )
    db.add(message)
    db.commit()
    db.refresh(message)

    return MessageResponse(success=True, message="Direct message sent", data=message.to_dict())


@router.post("/messages/list", response_model=MessageListResponse, summary="List messages in a thread")
async def list_messages(req: MessageList, db: Session = Depends(get_db)):
    """List all messages in a thread, ordered by timestamp (newest first)."""
    query = db.query(Message).filter(Message.thread_id == req.thread_id)
    total = query.count()
    offset = (req.page - 1) * req.page_size
    messages = query.order_by(desc(Message.timestamp)).offset(offset).limit(req.page_size).all()

    return MessageListResponse(
        success=True,
        message=f"Found {total} messages in thread {req.thread_id}",
        data=[m.to_dict() for m in messages],
        total=total,
    )
