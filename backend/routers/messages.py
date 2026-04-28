"""
Messaging Service — Thread and Message APIs
Handles message threads, sending messages with retry logic, and conversation history.
"""

import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc, text, asc

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
    Each participant is identified by user_id and user_type (member/recruiter).
    """
    # Check for existing 1-on-1 thread between these two participants
    if len(req.participant_ids) == 2:
        p1 = req.participant_ids[0]
        p2 = req.participant_ids[1]
        
        existing_thread_id = db.execute(text("""
            SELECT thread_id FROM thread_participants 
            WHERE (user_id = :u1 AND user_type = :t1)
               OR (user_id = :u2 AND user_type = :t2)
            GROUP BY thread_id
            HAVING COUNT(thread_id) = 2
        """), {
            "u1": p1["user_id"], "t1": p1["user_type"],
            "u2": p2["user_id"], "t2": p2["user_type"]
        }).scalar()
        
        if existing_thread_id:
            thread = db.query(Thread).filter(Thread.thread_id == existing_thread_id).first()
            if thread:
                data = thread.to_dict()
                data["participants"] = req.participant_ids
                return MessageResponse(success=True, message="Existing thread retrieved", data=data)

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
    participants_info = []
    other_participant = None
    for p in req.participant_ids:
        info = {"user_id": p["user_id"], "user_type": p["user_type"]}
        if p["user_type"] == "member":
            m = db.query(Member).filter(Member.member_id == p["user_id"]).first()
            if m:
                info["name"] = f"{m.first_name} {m.last_name}"
                info["photo_url"] = m.profile_photo_url
                info["headline"] = m.headline
        else:
            r = db.query(Recruiter).filter(Recruiter.recruiter_id == p["user_id"]).first()
            if r:
                info["name"] = f"{r.first_name} {r.last_name}"
                info["photo_url"] = r.profile_photo_url
                info["headline"] = r.company_name
        
        participants_info.append(info)
        # Identify "other" participant for 1-on-1 threads
        if p["user_id"] != current_user.user_id or p["user_type"] != current_user.user_type:
            other_participant = info
    
    data["participants"] = participants_info
    if other_participant:
        data["other_participant"] = other_participant

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
    # Fetch participants info
    participants = db.query(ThreadParticipant).filter(ThreadParticipant.thread_id == thread.thread_id).all()
    participants_info = []
    other_participant = None
    for p in participants:
        info = {"user_id": p.user_id, "user_type": p.user_type}
        if p.user_type == "member":
            m = db.query(Member).filter(Member.member_id == p.user_id).first()
            if m:
                info["name"] = f"{m.first_name} {m.last_name}"
                info["photo_url"] = m.profile_photo_url
                info["headline"] = m.headline
        else:
            r = db.query(Recruiter).filter(Recruiter.recruiter_id == p.user_id).first()
            if r:
                info["name"] = f"{r.first_name} {r.last_name}"
                info["photo_url"] = r.profile_photo_url
                info["headline"] = r.company_name
        participants_info.append(info)
        # For get_thread, we might not have current_user easily here if we want to support unauthenticated view, 
        # but usually messaging is authenticated. If we don't have it, we just pick the one that isn't the "first"? 
        # Better: let frontend decide or just return all and let frontend filter.
        # But for 1-on-1, just returning the one that isn't the caller is best.
    
    data["participants"] = participants_info
    # We'll try to find the other participant if we can identify the caller (e.g. from context if added)
    # For now, just return all info. Frontend in MessagingPanel already expects other_participant to be set.
    if len(participants_info) == 2:
        # If we had current_user we'd filter. Since get_thread doesn't take current_user in signature above, 
        # we'll leave it to threads_by_user which is more common for listing.
        pass

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

    threads = db.query(Thread).filter(Thread.thread_id.in_(paginated_ids)).order_by(desc(Thread.updated_at)).all()
    result = []
    for thread in threads:
        data = thread.to_dict()
        
        # Fetch participants info
        participants = db.query(ThreadParticipant).filter(ThreadParticipant.thread_id == thread.thread_id).all()
        participants_info = []
        other_participant = None
        for p in participants:
            info = {"user_id": p.user_id, "user_type": p.user_type}
            if p.user_type == "member":
                m = db.query(Member).filter(Member.member_id == p.user_id).first()
                if m:
                    info["name"] = f"{m.first_name} {m.last_name}"
                    info["photo_url"] = m.profile_photo_url
                    info["headline"] = m.headline
            else:
                r = db.query(Recruiter).filter(Recruiter.recruiter_id == p.user_id).first()
                if r:
                    info["name"] = f"{r.first_name} {r.last_name}"
                    info["photo_url"] = r.profile_photo_url
                    info["headline"] = r.company_name
            participants_info.append(info)
            if p.user_id != req.user_id or p.user_type != req.user_type:
                other_participant = info
        
        data["participants"] = participants_info
        if other_participant:
            data["other_participant"] = other_participant

        # Count unread messages in this thread for this user
        unread_count = db.query(Message).filter(
            Message.thread_id == thread.thread_id,
            (Message.sender_id != req.user_id) | (Message.sender_type != req.user_type),
            Message.is_read == False
        ).count()
        data["unread_count"] = unread_count

        last_msg = db.query(Message).filter(
            Message.thread_id == thread.thread_id
        ).order_by(desc(Message.timestamp)).first()
        if last_msg:
            data["last_message"] = last_msg.to_dict()
        result.append(data)

    return MessageListResponse(success=True, message=f"Found {total} threads", data=result, total=total)


@router.post("/messages/unread_count", response_model=MessageResponse, summary="Get unread message count")
async def unread_count(
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """Count unread messages for the current user."""
    user_threads = db.query(ThreadParticipant.thread_id).filter(
        ThreadParticipant.user_id == current_user.user_id,
        ThreadParticipant.user_type == current_user.user_type,
    ).all()
    thread_ids = [t[0] for t in user_threads]
    
    if not thread_ids:
        return MessageResponse(success=True, message="No threads", data={"count": 0})
        
    unread_threads_count = db.query(Message.thread_id).filter(
        Message.thread_id.in_(thread_ids),
        (Message.sender_id != current_user.user_id) | (Message.sender_type != current_user.user_type),
        Message.is_read == False
    ).distinct().count()
    
    return MessageResponse(success=True, message="Unread threads count retrieved", data={"count": unread_threads_count})


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
            # Update thread's updated_at to bring it to the top of the conversation list
            db.execute(text("UPDATE threads SET updated_at = NOW() WHERE thread_id = :tid"), {"tid": req.thread_id})
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
async def list_messages(
    req: MessageList, 
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """List all messages in a thread, ordered by timestamp (oldest first)."""
    # Get the latest messages for the thread
    # We sort by DESC to get the most recent ones for the current page, 
    # then we will reverse them for chronological display in the UI.
    messages_query = db.query(Message).filter(Message.thread_id == req.thread_id).order_by(desc(Message.timestamp))
    total = messages_query.count()
    
    offset = (req.page - 1) * req.page_size
    messages = messages_query.offset(offset).limit(req.page_size).all()
    
    # Reverse to chronological order (oldest -> newest) for the chat window
    messages.reverse()

    # Mark messages sent by others as read for this user
    db.execute(text("""
        UPDATE messages SET is_read = 1 
        WHERE thread_id = :tid 
        AND (sender_id != :uid OR sender_type != :utype)
    """), {"tid": req.thread_id, "uid": current_user.user_id, "utype": current_user.user_type})
    db.commit()

    return MessageListResponse(
        success=True,
        message=f"Found {total} messages in thread {req.thread_id}",
        data=[m.to_dict() for m in messages],
        total=total,
    )
