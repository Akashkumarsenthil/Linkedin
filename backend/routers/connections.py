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
from auth import require_member, TokenPayload
from schemas.connection import (
    ConnectionRequest, ConnectionAccept, ConnectionReject, ConnectionList,
    MutualConnections, ConnectionResponse, ConnectionListResponse,
)
from kafka_producer import kafka_producer

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/connections", tags=["Connection Service"])


@router.post("/request", response_model=ConnectionResponse, summary="Send a connection request")
async def send_connection_request(
    req: ConnectionRequest,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(require_member),
):
    """
    Send a connection request from one member to another.
    Handles: self-connection, duplicate request, and already connected errors.
    """
    if req.requester_id != current_user.user_id:
        return ConnectionResponse(success=False, message="Cannot send connection request on behalf of another member")

    if req.requester_id == req.receiver_id:
        return ConnectionResponse(success=False, message="Cannot connect with yourself")

    # Verify both members exist
    requester = db.query(Member).filter(Member.member_id == req.requester_id).first()
    if not requester:
        return ConnectionResponse(success=False, message=f"Member {req.requester_id} not found")

    receiver = db.query(Member).filter(Member.member_id == req.receiver_id).first()
    if not receiver:
        return ConnectionResponse(success=False, message=f"Member {req.receiver_id} not found")

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
        )
    except Exception:
        pass

    return ConnectionResponse(success=True, message="Connection request sent", data=connection.to_dict())


@router.post("/accept", response_model=ConnectionResponse, summary="Accept a connection request")
async def accept_connection(
    req: ConnectionAccept,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(require_member),
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

    # Atomic counter increments — avoids read-modify-write race under concurrent accepts
    db.execute(
        update(Member)
        .where(Member.member_id == conn.requester_id)
        .values(connections_count=Member.connections_count + 1)
    )
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
        )
    except Exception:
        pass

    return ConnectionResponse(success=True, message="Connection accepted", data=conn.to_dict())


@router.post("/reject", response_model=ConnectionResponse, summary="Reject a connection request")
async def reject_connection(
    req: ConnectionReject,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(require_member),
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

    # Enrich with member names
    result = []
    for conn in connections:
        data = conn.to_dict()
        other_id = conn.receiver_id if conn.requester_id == req.user_id else conn.requester_id
        other_member = db.query(Member).filter(Member.member_id == other_id).first()
        if other_member:
            data["connected_member"] = {
                "member_id": other_member.member_id,
                "name": f"{other_member.first_name} {other_member.last_name}",
                "headline": other_member.headline,
            }
        result.append(data)

    return ConnectionListResponse(
        success=True,
        message=f"Found {total} connections",
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
