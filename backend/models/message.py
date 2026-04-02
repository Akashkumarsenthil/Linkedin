"""
Messaging SQLAlchemy Models — Thread, ThreadParticipant, Message
"""

from sqlalchemy import Column, Integer, String, Text, TIMESTAMP, Enum, Boolean
from sqlalchemy.sql import func
from database import Base


class Thread(Base):
    __tablename__ = "threads"

    thread_id = Column(Integer, primary_key=True, autoincrement=True)
    subject = Column(String(500))
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    def to_dict(self):
        return {
            "thread_id": self.thread_id,
            "subject": self.subject,
            "created_at": str(self.created_at) if self.created_at else None,
            "updated_at": str(self.updated_at) if self.updated_at else None,
        }


class ThreadParticipant(Base):
    __tablename__ = "thread_participants"

    id = Column(Integer, primary_key=True, autoincrement=True)
    thread_id = Column(Integer, nullable=False)
    user_id = Column(Integer, nullable=False)
    user_type = Column(Enum("member", "recruiter"), nullable=False)


class Message(Base):
    __tablename__ = "messages"

    message_id = Column(Integer, primary_key=True, autoincrement=True)
    thread_id = Column(Integer, nullable=False)
    sender_id = Column(Integer, nullable=False)
    sender_type = Column(Enum("member", "recruiter"), nullable=False)
    message_text = Column(Text, nullable=False)
    timestamp = Column(TIMESTAMP, server_default=func.now())
    is_read = Column(Boolean, default=False)

    def to_dict(self):
        return {
            "message_id": self.message_id,
            "thread_id": self.thread_id,
            "sender_id": self.sender_id,
            "sender_type": self.sender_type,
            "message_text": self.message_text,
            "timestamp": str(self.timestamp) if self.timestamp else None,
            "is_read": self.is_read,
        }
