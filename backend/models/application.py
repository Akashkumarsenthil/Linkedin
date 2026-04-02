"""
Job Application SQLAlchemy Model
"""

from sqlalchemy import Column, Integer, String, Text, JSON, TIMESTAMP, Enum
from sqlalchemy.sql import func
from database import Base


class Application(Base):
    __tablename__ = "applications"

    application_id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(Integer, nullable=False)
    member_id = Column(Integer, nullable=False)
    resume_url = Column(String(500))
    resume_text = Column(Text)
    cover_letter = Column(Text)
    application_datetime = Column(TIMESTAMP, server_default=func.now())
    status = Column(
        Enum("submitted", "reviewing", "rejected", "interview", "offer"),
        default="submitted",
    )
    answers = Column(JSON)
    recruiter_notes = Column(Text)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    def to_dict(self):
        return {
            "application_id": self.application_id,
            "job_id": self.job_id,
            "member_id": self.member_id,
            "resume_url": self.resume_url,
            "resume_text": self.resume_text,
            "cover_letter": self.cover_letter,
            "application_datetime": str(self.application_datetime) if self.application_datetime else None,
            "status": self.status,
            "answers": self.answers,
            "recruiter_notes": self.recruiter_notes,
            "created_at": str(self.created_at) if self.created_at else None,
            "updated_at": str(self.updated_at) if self.updated_at else None,
        }
