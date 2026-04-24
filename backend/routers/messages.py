"""
Messaging Service — Thread and Message APIs
Handles message threads, sending messages with retry logic, and conversation history.
"""

import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc

from database import get_db
from models.message import Thread, ThreadParticipant, Message
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
    # Enforce caller can only send as themselves
    if req.sender_id != current_user.user_id:
        return MessageResponse(success=False, message="Cannot send message on behalf of another user")

    # Verify thread exists
    thread = db.query(Thread).filter(Thread.thread_id == req.thread_id).first()
    if not thread:
        return MessageResponse(success=False, message=f"Thread {req.thread_id} not found")

    # Verify sender is a participant
    participant = db.query(ThreadParticipant).filter(
        ThreadParticipant.thread_id == req.thread_id,
        ThreadParticipant.user_id == req.sender_id,
        ThreadParticipant.user_type == req.sender_type,
    ).first()
    if not participant:
        return MessageResponse(success=False, message="Sender is not a participant in this thread")

    # Send message with retry
    max_retries = 3
    for attempt in range(max_retries):
        try:
            message = Message(
                thread_id=req.thread_id,
                sender_id=req.sender_id,
                sender_type=req.sender_type,
                message_text=req.message_text,
            )
            db.add(message)
            db.commit()
            db.refresh(message)
            break
        except Exception as e:
            db.rollback()
            if attempt == max_retries - 1:
                logger.error(f"Message send failed after {max_retries} retries: {e}")
                return MessageResponse(success=False, message="Message send failed. Please retry.")
            logger.warning(f"Message send attempt {attempt + 1} failed, retrying...")

    # Kafka event
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
