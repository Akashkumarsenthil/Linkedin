"""
Connection Service — Connection Request, Accept, Reject, List, and Mutual APIs
"""

import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, update

from database import get_db
from models.connection import Connection
from models.member import Member
from models.recruiter import Recruiter
from auth import get_current_user, TokenPayload
from schemas.connection import (
    ConnectionRequest, ConnectionAccept, ConnectionReject, ConnectionRemove,
    ConnectionList, MutualConnections, ConnectionResponse, ConnectionListResponse,
)
from kafka_producer import kafka_producer

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/connections", tags=["Connection Service"])


def _user_exists(db: Session, user_id: int) -> bool:
    """Check if a user exists as either a member or a recruiter."""
    if db.query(Member).filter(Member.member_id == user_id).first():
        return True
    if db.query(Recruiter).filter(Recruiter.recruiter_id == user_id).first():
        return True
    return False


def _get_user_name(db: Session, user_id: int) -> dict | None:
    """Get basic info for a user (member or recruiter)."""
    member = db.query(Member).filter(Member.member_id == user_id).first()
    if member:
        return {
            "member_id": member.member_id,
            "name": f"{member.first_name} {member.last_name}",
            "headline": member.headline,
            "user_type": "member",
        }
    recruiter = db.query(Recruiter).filter(Recruiter.recruiter_id == user_id).first()
    if recruiter:
        return {
            "member_id": recruiter.recruiter_id,
            "name": f"{recruiter.first_name} {recruiter.last_name}",
            "headline": recruiter.company_name or recruiter.role or "Recruiter",
            "user_type": "recruiter",
        }
    return None


@router.post("/request", response_model=ConnectionResponse, summary="Send a connection request")
async def send_connection_request(
    req: ConnectionRequest,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """
    Send a connection request from one user to another.
    Works for both members and recruiters.
    """
    if req.requester_id != current_user.user_id:
        return ConnectionResponse(success=False, message="Cannot send connection request on behalf of another user")

    if req.requester_id == req.receiver_id:
        return ConnectionResponse(success=False, message="Cannot connect with yourself")

    # Verify both users exist (in either members or recruiters table)
    if not _user_exists(db, req.requester_id):
        return ConnectionResponse(success=False, message=f"User {req.requester_id} not found")

    if not _user_exists(db, req.receiver_id):
        return ConnectionResponse(success=False, message=f"User {req.receiver_id} not found")

    # Check for existing connection (in either direction)
    existing = db.query(Connection).filter(
        or_(
            and_(Connection.requester_id == req.requester_id, Connection.receiver_id == req.receiver_id),
            and_(Connection.requester_id == req.receiver_id, Connection.receiver_id == req.requester_id),
        )
    ).first()

    if existing:
        if existing.status == "accepted":
            return ConnectionResponse(success=False, message="Already connected")
        elif existing.status == "pending":
            return ConnectionResponse(success=False, message="Connection request already pending")
        elif existing.status == "rejected":
            # Allow re-requesting after rejection
            existing.status = "pending"
            existing.requester_id = req.requester_id
            existing.receiver_id = req.receiver_id
            db.commit()
            db.refresh(existing)
            return ConnectionResponse(success=True, message="Connection re-requested", data=existing.to_dict())

    connection = Connection(requester_id=req.requester_id, receiver_id=req.receiver_id)
    db.add(connection)
    db.commit()
    db.refresh(connection)

    try:
        await kafka_producer.publish(
            topic="connection.requested",
            event_type="connection.requested",
            actor_id=str(req.requester_id),
            entity_type="connection",
            entity_id=str(connection.connection_id),
            payload={"receiver_id": req.receiver_id},
            idempotency_key=f"conn_request:{req.requester_id}:{req.receiver_id}",
        )
    except Exception as e:
        logger.warning(f"Kafka publish failed for connection.requested (conn_id={connection.connection_id}): {e}")

    return ConnectionResponse(success=True, message="Connection request sent", data=connection.to_dict())


@router.post("/accept", response_model=ConnectionResponse, summary="Accept a connection request")
async def accept_connection(
    req: ConnectionAccept,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """Accept a pending connection request. Updates both members' connection counts."""
    conn = db.query(Connection).filter(Connection.connection_id == req.connection_id).first()
    if not conn:
        return ConnectionResponse(success=False, message=f"Connection {req.connection_id} not found")

    if conn.receiver_id != current_user.user_id:
        return ConnectionResponse(success=False, message="Only the connection receiver can accept this request")

    if conn.status != "pending":
        return ConnectionResponse(success=False, message=f"Connection is already {conn.status}")

    conn.status = "accepted"

    # Atomic counter increments — only for members (recruiters don't have this field)
    if db.query(Member).filter(Member.member_id == conn.requester_id).first():
        db.execute(
            update(Member)
            .where(Member.member_id == conn.requester_id)
            .values(connections_count=Member.connections_count + 1)
        )
    if db.query(Member).filter(Member.member_id == conn.receiver_id).first():
        db.execute(
            update(Member)
            .where(Member.member_id == conn.receiver_id)
            .values(connections_count=Member.connections_count + 1)
        )

    db.commit()
    db.refresh(conn)

    try:
        await kafka_producer.publish(
            topic="connection.accepted",
            event_type="connection.accepted",
            actor_id=str(conn.receiver_id),
            entity_type="connection",
            entity_id=str(req.connection_id),
            payload={"requester_id": conn.requester_id},
            idempotency_key=f"conn_accept:{req.connection_id}",
        )
    except Exception as e:
        logger.warning(f"Kafka publish failed for connection.accepted (conn_id={req.connection_id}): {e}")

    return ConnectionResponse(success=True, message="Connection accepted", data=conn.to_dict())


@router.post("/reject", response_model=ConnectionResponse, summary="Reject a connection request")
async def reject_connection(
    req: ConnectionReject,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """Reject a pending connection request."""
    conn = db.query(Connection).filter(Connection.connection_id == req.connection_id).first()
    if not conn:
        return ConnectionResponse(success=False, message=f"Connection {req.connection_id} not found")

    if conn.receiver_id != current_user.user_id:
        return ConnectionResponse(success=False, message="Only the connection receiver can reject this request")

    if conn.status != "pending":
        return ConnectionResponse(success=False, message=f"Connection is already {conn.status}")

    conn.status = "rejected"
    db.commit()
    db.refresh(conn)

    return ConnectionResponse(success=True, message="Connection rejected", data=conn.to_dict())


@router.post("/list", response_model=ConnectionListResponse, summary="List user's connections")
async def list_connections(req: ConnectionList, db: Session = Depends(get_db)):
    """List all accepted connections for a member."""
    query = db.query(Connection).filter(
        or_(
            Connection.requester_id == req.user_id,
            Connection.receiver_id == req.user_id,
        ),
        Connection.status == "accepted",
    )

    total = query.count()
    offset = (req.page - 1) * req.page_size
    connections = query.offset(offset).limit(req.page_size).all()

    # Enrich with user names (member or recruiter)
    result = []
    for conn in connections:
        data = conn.to_dict()
        other_id = conn.receiver_id if conn.requester_id == req.user_id else conn.requester_id
        user_info = _get_user_name(db, other_id)
        if user_info:
            data["connected_member"] = user_info
        result.append(data)

    return ConnectionListResponse(
        success=True,
        message=f"Found {total} connections",
        data=result,
        total=total,
    )


@router.post("/pending", response_model=ConnectionListResponse, summary="List pending connection requests")
async def pending_connections(req: ConnectionList, db: Session = Depends(get_db)):
    """List all pending connection requests received by the user."""
    query = db.query(Connection).filter(
        Connection.receiver_id == req.user_id,
        Connection.status == "pending",
    )

    total = query.count()
    offset = (req.page - 1) * req.page_size
    connections = query.offset(offset).limit(req.page_size).all()

    # Enrich with user names (member or recruiter) of the requester
    result = []
    for conn in connections:
        data = conn.to_dict()
        user_info = _get_user_name(db, conn.requester_id)
        if user_info:
            data["connected_member"] = user_info
        result.append(data)

    return ConnectionListResponse(
        success=True,
        message=f"Found {total} pending requests",
        data=result,
        total=total,
    )


@router.post("/mutual", response_model=ConnectionListResponse, summary="Find mutual connections")
async def mutual_connections(req: MutualConnections, db: Session = Depends(get_db)):
    """Find mutual connections between two members (extra credit)."""
    # Get connections for user A
    user_a_conns = db.query(Connection).filter(
        or_(Connection.requester_id == req.user_id, Connection.receiver_id == req.user_id),
        Connection.status == "accepted",
    ).all()
    user_a_ids = set()
    for c in user_a_conns:
        user_a_ids.add(c.receiver_id if c.requester_id == req.user_id else c.requester_id)

    # Get connections for user B
    user_b_conns = db.query(Connection).filter(
        or_(Connection.requester_id == req.other_id, Connection.receiver_id == req.other_id),
        Connection.status == "accepted",
    ).all()
    user_b_ids = set()
    for c in user_b_conns:
        user_b_ids.add(c.receiver_id if c.requester_id == req.other_id else c.requester_id)

    # Intersection
    mutual_ids = user_a_ids & user_b_ids
    mutual_members = db.query(Member).filter(Member.member_id.in_(mutual_ids)).all() if mutual_ids else []

    return ConnectionListResponse(
        success=True,
        message=f"Found {len(mutual_members)} mutual connections",
        data=[
            {
                "member_id": m.member_id,
                "name": f"{m.first_name} {m.last_name}",
                "headline": m.headline,
            }
            for m in mutual_members
        ],
        total=len(mutual_members),
    )


@router.post("/remove", response_model=ConnectionResponse, summary="Remove an existing connection")
async def remove_connection(
    req: ConnectionRemove,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """
    Remove an existing connection between two users.
    Deletes the row from the connections table.
    """
    if req.user_id != current_user.user_id:
        return ConnectionResponse(success=False, message="Unauthorized")

    # Find connection in either direction
    connection = db.query(Connection).filter(
        or_(
            and_(Connection.requester_id == req.user_id, Connection.receiver_id == req.other_id),
            and_(Connection.requester_id == req.other_id, Connection.receiver_id == req.user_id),
        )
    ).first()

    if not connection:
        return ConnectionResponse(success=False, message="Connection not found")

    db.delete(connection)
    db.commit()

    return ConnectionResponse(success=True, message="Connection removed")
