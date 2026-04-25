"""
FailedKafkaEvent — SQLAlchemy model for the dual-write fallback table.

When a Kafka publish fails after a successful DB commit, the event payload is
written here so it is not silently lost.  A retry mechanism (or manual replay)
can inspect this table and republish outstanding events.

The table is created automatically by Base.metadata.create_all() at startup
(main.py) and is also present in db/init.sql for clean deployments.
"""

import json
from sqlalchemy import Column, Integer, String, Text, TIMESTAMP
from sqlalchemy.sql import func
from database import Base


class FailedKafkaEvent(Base):
    __tablename__ = "failed_kafka_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    topic = Column(String(255), nullable=False)
    event_type = Column(String(255), nullable=False)
    entity_id = Column(String(255))
    actor_id = Column(String(255))
    payload = Column(Text)          # JSON-serialised event payload
    error_message = Column(Text)    # The exception message from the failed publish
    created_at = Column(TIMESTAMP, server_default=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "topic": self.topic,
            "event_type": self.event_type,
            "entity_id": self.entity_id,
            "actor_id": self.actor_id,
            "payload": json.loads(self.payload) if self.payload else {},
            "error_message": self.error_message,
            "created_at": str(self.created_at) if self.created_at else None,
        }
