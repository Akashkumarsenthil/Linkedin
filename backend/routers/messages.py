"""
Messaging Service — Thread and Message APIs
Handles message threads, sending messages with retry logic, and conversation history.
"""

import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, and_

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
    # Check if a 1-on-1 thread already exists
    if len(req.participant_ids) == 2:
        p1 = req.participant_ids[0]
        p2 = req.participant_ids[1]
        
        p1_threads = db.query(ThreadParticipant.thread_id).filter(
            ThreadParticipant.user_id == p1["user_id"],
            ThreadParticipant.user_type == p1["user_type"]
        ).subquery()
        
        existing_tp = db.query(ThreadParticipant.thread_id).filter(
            ThreadParticipant.user_id == p2["user_id"],
            ThreadParticipant.user_type == p2["user_type"],
            ThreadParticipant.thread_id.in_(p1_threads)
        ).first()
        
        if existing_tp:
            thread_id = existing_tp[0]
            thread = db.query(Thread).filter(Thread.thread_id == thread_id).first()
            if thread:
                data = thread.to_dict()
                return MessageResponse(success=True, message="Existing thread found", data=data)

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
    """List all messaging threads for a specific user, sorted by newest message."""
    # Find all threads the user is in
    user_threads = db.query(ThreadParticipant).filter(
        ThreadParticipant.user_id == req.user_id,
        ThreadParticipant.user_type == req.user_type,
    ).all()

    if not user_threads:
        return MessageListResponse(success=True, message="No threads found", data=[], total=0)

    # For each thread, get the latest message timestamp or thread creation time
    thread_data_list = []
    for ut in user_threads:
        thread = db.query(Thread).filter(Thread.thread_id == ut.thread_id).first()
        if not thread: continue

        last_msg = db.query(Message).filter(
            Message.thread_id == thread.thread_id
        ).order_by(desc(Message.timestamp)).first()
        
        sort_time = last_msg.timestamp if last_msg else thread.created_at
        
        # Calculate unread count for THIS user in THIS thread
        unread_q = db.query(Message).filter(
            Message.thread_id == thread.thread_id,
            Message.sender_id != req.user_id, # Don't count own messages
            Message.timestamp > ut.last_read_at
        )
        unread_count = unread_q.count()

        data = thread.to_dict()
        data["sort_time"] = sort_time
        data["unread_count"] = unread_count
        
        # Get other participant
        other_tp = db.query(ThreadParticipant).filter(
            ThreadParticipant.thread_id == thread.thread_id,
            (ThreadParticipant.user_id != req.user_id) | (ThreadParticipant.user_type != req.user_type)
        ).first()
        
        if other_tp:
            other_data = {"user_id": other_tp.user_id, "user_type": other_tp.user_type}
            if other_tp.user_type == "member":
                m = db.query(Member).filter(Member.member_id == other_tp.user_id).first()
                if m:
                    other_data["name"] = f"{m.first_name} {m.last_name}"
                    other_data["headline"] = m.headline
                    other_data["photo_url"] = m.profile_photo_url
            elif other_tp.user_type == "recruiter":
                r = db.query(Recruiter).filter(Recruiter.recruiter_id == other_tp.user_id).first()
                if r:
                    other_data["name"] = f"{r.first_name} {r.last_name}"
                    other_data["headline"] = r.company_name
                    other_data["photo_url"] = getattr(r, "profile_photo_url", None)
            data["other_participant"] = other_data

        if last_msg:
            data["last_message"] = last_msg.to_dict()
        
        thread_data_list.append(data)

    # Sort by sort_time descending
    thread_data_list.sort(key=lambda x: x["sort_time"], reverse=True)

    total = len(thread_data_list)
    offset = (req.page - 1) * req.page_size
    paginated_data = thread_data_list[offset : offset + req.page_size]

    return MessageListResponse(success=True, message=f"Found {total} threads", data=paginated_data, total=total)


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
            idempotency_key=f"msg_sent:{message.message_id}",
        )
    except Exception as e:
        logger.warning(f"Kafka publish failed for message.sent (message_id={message.message_id}): {e}")

    return MessageResponse(success=True, message="Message sent successfully", data=message.to_dict())


@router.post("/messages/list", response_model=MessageListResponse, summary="List messages in a thread")
async def list_messages(
    req: MessageList, 
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user)
):
    """List all messages in a thread, and mark as read for the current user."""
    # Mark as read: update ThreadParticipant.last_read_at
    participant = db.query(ThreadParticipant).filter(
        ThreadParticipant.thread_id == req.thread_id,
        ThreadParticipant.user_id == current_user.user_id,
        ThreadParticipant.user_type == current_user.user_type
    ).first()
    
    if participant:
        participant.last_read_at = func.now()
        db.commit()

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

@router.post("/messages/unreadCount", response_model=MessageResponse, summary="Get total unread message count")
async def get_unread_count(
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user)
):
    """Get the total number of unread messages across all threads for the current user."""
    # Find all threads the user is in
    user_threads = db.query(ThreadParticipant).filter(
        ThreadParticipant.user_id == current_user.user_id,
        ThreadParticipant.user_type == current_user.user_type
    ).all()
    
    total_unread = 0
    for ut in user_threads:
        unread_q = db.query(Message).filter(
            Message.thread_id == ut.thread_id,
            Message.sender_id != current_user.user_id,
            Message.timestamp > ut.last_read_at
        )
        total_unread += unread_q.count()
        
    return MessageResponse(success=True, message="Unread count retrieved", data={"unread_count": total_unread})
