"""
Recruiter / Employer Admin SQLAlchemy Model
"""

from sqlalchemy import Column, Integer, String, TIMESTAMP
from sqlalchemy.sql import func
from database import Base


class Recruiter(Base):
    __tablename__ = "recruiters"

    recruiter_id = Column(Integer, primary_key=True, autoincrement=True)
    company_id = Column(Integer)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    email = Column(String(255), nullable=False, unique=True)
    phone = Column(String(20))
    company_name = Column(String(255))
    company_industry = Column(String(255))
    company_size = Column(String(50))
    role = Column(String(100), default="recruiter")
    access_level = Column(String(50), default="standard")
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    def to_dict(self):
        return {
            "recruiter_id": self.recruiter_id,
            "company_id": self.company_id,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "email": self.email,
            "phone": self.phone,
            "company_name": self.company_name,
            "company_industry": self.company_industry,
            "company_size": self.company_size,
            "role": self.role,
            "access_level": self.access_level,
            "created_at": str(self.created_at) if self.created_at else None,
            "updated_at": str(self.updated_at) if self.updated_at else None,
        }
