"""
Member (Applicant) SQLAlchemy Model
"""

from sqlalchemy import Column, Integer, String, Text, JSON, TIMESTAMP, Date
from sqlalchemy.sql import func
from database import Base


class Member(Base):
    __tablename__ = "members"

    member_id = Column(Integer, primary_key=True, autoincrement=True)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    email = Column(String(255), nullable=False, unique=True)
    phone = Column(String(20))
    location_city = Column(String(100))
    location_state = Column(String(100))
    location_country = Column(String(100))
    headline = Column(String(500))
    about = Column(Text)
    experience = Column(JSON)
    education = Column(JSON)
    skills = Column(JSON)
    profile_photo_url = Column(Text)
    resume_text = Column(Text)
    connections_count = Column(Integer, default=0)
    profile_views = Column(Integer, default=0)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    def to_dict(self):
        return {
            "member_id": self.member_id,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "email": self.email,
            "phone": self.phone,
            "location_city": self.location_city,
            "location_state": self.location_state,
            "location_country": self.location_country,
            "headline": self.headline,
            "about": self.about,
            "experience": self.experience,
            "education": self.education,
            "skills": self.skills,
            "profile_photo_url": self.profile_photo_url,
            "resume_text": self.resume_text,
            "connections_count": self.connections_count,
            "profile_views": self.profile_views,
            "created_at": str(self.created_at) if self.created_at else None,
            "updated_at": str(self.updated_at) if self.updated_at else None,
        }


class ProfileViewDaily(Base):
    __tablename__ = "profile_views_daily"

    id = Column(Integer, primary_key=True, autoincrement=True)
    member_id = Column(Integer, nullable=False)
    view_date = Column(Date, nullable=False)
    view_count = Column(Integer, default=1)
