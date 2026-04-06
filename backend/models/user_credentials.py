"""
User Credentials Model — stores login credentials separately from
member/recruiter profile tables so the auth layer can be added without
modifying existing schemas.
"""

from sqlalchemy import Column, Integer, String, TIMESTAMP, Enum
from sqlalchemy.sql import func
from database import Base


class UserCredentials(Base):
    __tablename__ = "user_credentials"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_type = Column(Enum("member", "recruiter"), nullable=False)
    user_id = Column(Integer, nullable=False)
    email = Column(String(255), nullable=False, unique=True, index=True)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "user_type": self.user_type,
            "user_id": self.user_id,
            "email": self.email,
            "created_at": str(self.created_at) if self.created_at else None,
        }
