"""
Shared Kafka fallback utility used by all service routers.
"""

import json
import logging

from database import SessionLocal
from models.failed_kafka_event import FailedKafkaEvent

logger = logging.getLogger(__name__)


def log_failed_kafka_event(
    topic: str, event_type: str, entity_id: str, actor_id: str, payload: dict, error: Exception
) -> None:
    """Persist a failed Kafka publish so it is not silently lost (dual-write fallback)."""
    try:
        fke = FailedKafkaEvent(
            topic=topic,
            event_type=event_type,
            entity_id=str(entity_id),
            actor_id=str(actor_id),
            payload=json.dumps(payload, default=str),
            error_message=str(error)[:500],
        )
        db = SessionLocal()
        try:
            db.add(fke)
            db.commit()
            logger.warning(f"Kafka publish failed for {event_type} → recorded in failed_kafka_events (id={fke.id})")
        finally:
            db.close()
    except Exception as fb_err:
        logger.error(f"Could not write to failed_kafka_events: {fb_err}")
