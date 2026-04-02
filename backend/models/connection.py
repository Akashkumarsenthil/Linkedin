"""
Connection SQLAlchemy Model
"""

from sqlalchemy import Column, Integer, TIMESTAMP, Enum
from sqlalchemy.sql import func
from database import Base


class Connection(Base):
    __tablename__ = "connections"

    connection_id = Column(Integer, primary_key=True, autoincrement=True)
    requester_id = Column(Integer, nullable=False)
    receiver_id = Column(Integer, nullable=False)
    status = Column(Enum("pending", "accepted", "rejected"), default="pending")
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    def to_dict(self):
        return {
            "connection_id": self.connection_id,
            "requester_id": self.requester_id,
            "receiver_id": self.receiver_id,
            "status": self.status,
            "created_at": str(self.created_at) if self.created_at else None,
            "updated_at": str(self.updated_at) if self.updated_at else None,
        }
