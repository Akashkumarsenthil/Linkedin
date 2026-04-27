"""
Messaging Service — Thread and Message APIs
Handles message threads, sending messages with retry logic, and conversation history.
"""

import logging
from collections import defaultdict
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from sqlalchemy import desc, and_, or_
import jwt

from database import get_db
from models.message import Thread, ThreadParticipant, Message
from models.connection import Connection
from models.member import Member
from models.recruiter import Recruiter
from auth import get_current_user, TokenPayload
from config import settings
from database import mongo_db
from schemas.message import (
    ThreadOpen, ThreadGet, ThreadsByUser, MessageSend, MessageList,
    MessageResponse, MessageListResponse, UnreadSummaryRequest,
)
from kafka_producer import kafka_producer

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Messaging Service"])


class RealtimeThreadHub:
    """Best-effort in-memory pub/sub for per-thread realtime updates."""

    def __init__(self):
        self._clients = defaultdict(set)

    async def connect(self, thread_id: int, websocket: WebSocket):
        await websocket.accept()
        self._clients[thread_id].add(websocket)

    def disconnect(self, thread_id: int, websocket: WebSocket):
        clients = self._clients.get(thread_id)
        if not clients:
            return
        clients.discard(websocket)
        if not clients:
            self._clients.pop(thread_id, None)

    async def broadcast(self, thread_id: int, payload: dict):
        clients = list(self._clients.get(thread_id, set()))
        if not clients:
            return
        for ws in clients:
            try:
                await ws.send_json(payload)
            except Exception:
                self.disconnect(thread_id, ws)


realtime_hub = RealtimeThreadHub()


def _decode_ws_token(websocket: WebSocket):
    token = websocket.query_params.get("token")
    if not token:
        return None
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except Exception:
        return None


def _are_members_connected(db: Session, a_id: int, b_id: int) -> bool:
    conn = db.query(Connection).filter(
        or_(
            and_(Connection.requester_id == a_id, Connection.receiver_id == b_id),
            and_(Connection.requester_id == b_id, Connection.receiver_id == a_id),
        ),
        Connection.status == "accepted",
    ).first()
    return conn is not None


def _display_name_for_user(db: Session, user_id: int, user_type: str) -> str:
    if user_type == "member":
        m = db.query(Member).filter(Member.member_id == user_id).first()
        if m:
            return f"{m.first_name} {m.last_name}".strip()
    if user_type == "recruiter":
        r = db.query(Recruiter).filter(Recruiter.recruiter_id == user_id).first()
        if r:
            return f"{r.first_name} {r.last_name}".strip()
    return f"{user_type} #{user_id}"


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
    # Enforce caller is included in participants.
    caller_in_participants = any(
        p.get("user_id") == current_user.user_id and p.get("user_type") == current_user.user_type
        for p in req.participant_ids
    )
    if not caller_in_participants:
        return MessageResponse(success=False, message="Caller must be included as a thread participant")

    # For member-originated chats, require each target member to be connected to the caller.
    if current_user.user_type == "member":
        for p in req.participant_ids:
            if p.get("user_type") != "member":
                continue
            target_id = int(p.get("user_id"))
            if target_id == current_user.user_id:
                continue
            if not _are_members_connected(db, current_user.user_id, target_id):
                return MessageResponse(
                    success=False,
                    message=f"Members can only message accepted connections (member #{target_id})",
                )

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
        participants = db.query(ThreadParticipant).filter(
            ThreadParticipant.thread_id == thread.thread_id
        ).all()
        others = [
            {"user_id": p.user_id, "user_type": p.user_type}
            for p in participants
            if not (p.user_id == req.user_id and p.user_type == req.user_type)
        ]

        # Enforce visibility parity with messaging rules:
        # for member users, direct member-member threads are shown only if the
        # two members are currently connected.
        if req.user_type == "member" and len(participants) == 2 and all(p.user_type == "member" for p in participants):
            if others and not _are_members_connected(db, req.user_id, others[0]["user_id"]):
                continue

        if others:
            # For direct message UX, surface the first counterparty display name.
            other = others[0]
            data["recipient"] = {
                "user_id": other["user_id"],
                "user_type": other["user_type"],
                "name": _display_name_for_user(db, other["user_id"], other["user_type"]),
            }
            other_names = [
                _display_name_for_user(db, o["user_id"], o["user_type"])
                for o in others
            ]
            data["is_group"] = len(others) > 1
            data["participant_count"] = len(participants)
            if len(others) > 1:
                preview_names = ", ".join(other_names[:3])
                if len(other_names) > 3:
                    preview_names = f"{preview_names} +{len(other_names) - 3}"
                data["conversation_name"] = thread.subject or preview_names
            else:
                data["conversation_name"] = other_names[0]
        unread_count = db.query(Message).filter(
            Message.thread_id == thread.thread_id,
            Message.is_read.is_(False),
            ~and_(Message.sender_id == req.user_id, Message.sender_type == req.user_type),
        ).count()
        data["unread_count"] = unread_count
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

    # Re-check member-to-member connection gating at send-time.
    participants = db.query(ThreadParticipant).filter(
        ThreadParticipant.thread_id == req.thread_id
    ).all()
    if len(participants) == 2 and all(p.user_type == "member" for p in participants):
        if not _are_members_connected(db, participants[0].user_id, participants[1].user_id):
            return MessageResponse(success=False, message="Members can only message accepted connections")

    # Idempotency guard for client retries
    if req.client_message_id:
        dedup = await mongo_db.message_send_dedup.find_one(
            {
                "client_message_id": req.client_message_id,
                "thread_id": req.thread_id,
                "sender_id": req.sender_id,
                "sender_type": req.sender_type,
            }
        )
        if dedup:
            existing = db.query(Message).filter(Message.message_id == dedup.get("message_id")).first()
            if existing:
                return MessageResponse(success=True, message="Message already processed", data=existing.to_dict())

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

    if req.client_message_id:
        await mongo_db.message_send_dedup.update_one(
            {
                "client_message_id": req.client_message_id,
                "thread_id": req.thread_id,
                "sender_id": req.sender_id,
                "sender_type": req.sender_type,
            },
            {
                "$set": {
                    "message_id": message.message_id,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
            },
            upsert=True,
        )

    # Kafka event
    try:
        await kafka_producer.publish(
            topic="message.sent",
            event_type="message.sent",
            actor_id=str(req.sender_id),
            entity_type="thread",
            entity_id=str(req.thread_id),
            payload={
                "message_id": message.message_id,
                "sender_type": req.sender_type,
                "sender_id": req.sender_id,
                "thread_id": req.thread_id,
            },
        )
    except Exception:
        pass

    await realtime_hub.broadcast(
        req.thread_id,
        {"event": "message.created", "thread_id": req.thread_id, "message": message.to_dict()},
    )

    return MessageResponse(success=True, message="Message sent successfully", data=message.to_dict())


@router.post("/messages/list", response_model=MessageListResponse, summary="List messages in a thread")
async def list_messages(req: MessageList, db: Session = Depends(get_db)):
    """List all messages in a thread, ordered by timestamp (newest first)."""
    query = db.query(Message).filter(Message.thread_id == req.thread_id)
    total = query.count()
    offset = (req.page - 1) * req.page_size
    messages = query.order_by(desc(Message.timestamp)).offset(offset).limit(req.page_size).all()

    if req.mark_as_read and req.viewer_id is not None and req.viewer_type:
        db.query(Message).filter(
            Message.thread_id == req.thread_id,
            Message.is_read.is_(False),
            ~and_(Message.sender_id == req.viewer_id, Message.sender_type == req.viewer_type),
        ).update({"is_read": True}, synchronize_session=False)
        db.commit()
        await realtime_hub.broadcast(
            req.thread_id,
            {"event": "thread.read", "thread_id": req.thread_id, "reader_id": req.viewer_id, "reader_type": req.viewer_type},
        )

    return MessageListResponse(
        success=True,
        message=f"Found {total} messages in thread {req.thread_id}",
        data=[m.to_dict() for m in messages],
        total=total,
    )


@router.post("/messages/unread-summary", response_model=MessageResponse, summary="Unread message counters")
async def unread_summary(req: UnreadSummaryRequest, db: Session = Depends(get_db)):
    """Return unread totals and per-thread unread counts for a user."""
    participant_thread_ids = db.query(ThreadParticipant.thread_id).filter(
        ThreadParticipant.user_id == req.user_id,
        ThreadParticipant.user_type == req.user_type,
    ).all()
    thread_ids = [row[0] for row in participant_thread_ids]
    if not thread_ids:
        return MessageResponse(success=True, message="No threads found", data={"total_unread": 0, "threads": []})

    unread_rows = (
        db.query(Message.thread_id, Message.message_id)
        .filter(
            Message.thread_id.in_(thread_ids),
            Message.is_read.is_(False),
            ~and_(Message.sender_id == req.user_id, Message.sender_type == req.user_type),
        )
        .all()
    )

    per_thread = defaultdict(int)
    for row in unread_rows:
        per_thread[row.thread_id] += 1

    return MessageResponse(
        success=True,
        message="Unread counters loaded",
        data={
            "total_unread": len(unread_rows),
            "threads": [{"thread_id": tid, "unread_count": count} for tid, count in per_thread.items()],
        },
    )


@router.websocket("/messages/ws/{thread_id}")
async def thread_ws(websocket: WebSocket, thread_id: int, db: Session = Depends(get_db)):
    """
    Realtime updates for messages in a thread.
    Client passes JWT as query param: /messages/ws/{thread_id}?token=...
    """
    claims = _decode_ws_token(websocket)
    if not claims:
        await websocket.close(code=4401)
        return

    user_id = claims.get("user_id")
    user_type = claims.get("user_type")
    participant = db.query(ThreadParticipant).filter(
        ThreadParticipant.thread_id == thread_id,
        ThreadParticipant.user_id == user_id,
        ThreadParticipant.user_type == user_type,
    ).first()
    if not participant:
        await websocket.close(code=4403)
        return

    await realtime_hub.connect(thread_id, websocket)
    try:
        while True:
            # Keep the socket alive; incoming content is ignored for now.
            await websocket.receive_text()
    except WebSocketDisconnect:
        realtime_hub.disconnect(thread_id, websocket)
