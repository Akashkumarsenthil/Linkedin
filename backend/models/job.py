"""
Job Posting SQLAlchemy Model
"""

from sqlalchemy import Column, Integer, String, Text, JSON, DECIMAL, TIMESTAMP, Enum
from sqlalchemy.sql import func
from database import Base


class JobPosting(Base):
    __tablename__ = "job_postings"

    job_id = Column(Integer, primary_key=True, autoincrement=True)
    company_id = Column(Integer)
    recruiter_id = Column(Integer, nullable=False)
    title = Column(String(500), nullable=False)
    description = Column(Text)
    seniority_level = Column(String(100))
    employment_type = Column(String(100))
    location = Column(String(255))
    work_mode = Column(Enum("remote", "hybrid", "onsite"), default="onsite")
    skills_required = Column(JSON)
    salary_min = Column(DECIMAL(12, 2))
    salary_max = Column(DECIMAL(12, 2))
    posted_datetime = Column(TIMESTAMP, server_default=func.now())
    status = Column(Enum("open", "closed"), default="open")
    views_count = Column(Integer, default=0)
    applicants_count = Column(Integer, default=0)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    def to_dict(self):
        return {
            "job_id": self.job_id,
            "company_id": self.company_id,
            "recruiter_id": self.recruiter_id,
            "title": self.title,
            "description": self.description,
            "seniority_level": self.seniority_level,
            "employment_type": self.employment_type,
            "location": self.location,
            "work_mode": self.work_mode,
            "skills_required": self.skills_required,
            "salary_min": float(self.salary_min) if self.salary_min else None,
            "salary_max": float(self.salary_max) if self.salary_max else None,
            "posted_datetime": str(self.posted_datetime) if self.posted_datetime else None,
            "status": self.status,
            "views_count": self.views_count,
            "applicants_count": self.applicants_count,
            "created_at": str(self.created_at) if self.created_at else None,
            "updated_at": str(self.updated_at) if self.updated_at else None,
        }


class SavedJob(Base):
    __tablename__ = "saved_jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    member_id = Column(Integer, nullable=False)
    job_id = Column(Integer, nullable=False)
    saved_at = Column(TIMESTAMP, server_default=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "member_id": self.member_id,
            "job_id": self.job_id,
            "saved_at": str(self.saved_at) if self.saved_at else None,
        }
