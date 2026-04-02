"""
LinkedIn Platform — Kafka Consumer
Consumes domain events from Kafka topics with idempotent processing.
"""

import json
import asyncio
import logging
from typing import Dict, Callable, Set
from aiokafka import AIOKafkaConsumer
from config import settings
from database import mongo_db

logger = logging.getLogger(__name__)


class KafkaEventConsumer:
    """Async Kafka consumer with idempotent processing."""

    def __init__(self, group_id: str = "linkedin-backend"):
        self.group_id = group_id
        self.consumer: AIOKafkaConsumer = None
        self.handlers: Dict[str, Callable] = {}
        self.processed_keys: Set[str] = set()
        self._running = False

    def register_handler(self, event_type: str, handler: Callable):
        """Register a handler function for a specific event type."""
        self.handlers[event_type] = handler

    async def start(self, topics: list):
        """Start consuming from specified topics."""
        self.consumer = AIOKafkaConsumer(
            *topics,
            bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
            group_id=self.group_id,
            value_deserializer=lambda v: json.loads(v.decode("utf-8")),
            auto_offset_reset="earliest",
            enable_auto_commit=True,
            session_timeout_ms=10000,
            heartbeat_interval_ms=3000,
            request_timeout_ms=15000,
        )
        await asyncio.wait_for(self.consumer.start(), timeout=20)
        self._running = True
        logger.info(f"Kafka consumer started. Listening on: {topics}")

    async def stop(self):
        """Stop the consumer."""
        self._running = False
        if self.consumer:
            await self.consumer.stop()

    async def consume(self):
        """Main consumption loop with idempotent processing."""
        if not self.consumer:
            raise RuntimeError("Consumer not started")

        try:
            async for message in self.consumer:
                if not self._running:
                    break

                event = message.value
                event_type = event.get("event_type", "unknown")
                idempotency_key = event.get("idempotency_key", "")

                # Idempotency check — skip if already processed
                if idempotency_key in self.processed_keys:
                    logger.info(f"Skipping duplicate event: {idempotency_key}")
                    continue

                # Also check MongoDB for persistence across restarts
                existing = await mongo_db.processed_events.find_one(
                    {"idempotency_key": idempotency_key}
                )
                if existing:
                    logger.info(f"Skipping already-processed event: {idempotency_key}")
                    self.processed_keys.add(idempotency_key)
                    continue

                # Process the event
                handler = self.handlers.get(event_type)
                if handler:
                    try:
                        await handler(event)
                        # Record as processed
                        self.processed_keys.add(idempotency_key)
                        await mongo_db.processed_events.insert_one(
                            {"idempotency_key": idempotency_key, "event_type": event_type}
                        )
                        logger.info(f"Processed event: {event_type} ({idempotency_key})")
                    except Exception as e:
                        logger.error(f"Error processing {event_type}: {e}")
                else:
                    # Log unhandled events to MongoDB for observability
                    await mongo_db.event_logs.insert_one(event)
                    logger.debug(f"No handler for event type: {event_type}")

        except asyncio.CancelledError:
            logger.info("Consumer loop cancelled")
        except Exception as e:
            logger.error(f"Consumer error: {e}")


# Event handler functions
async def handle_job_viewed(event: dict):
    """Update job view count when a job.viewed event is received."""
    from database import SessionLocal
    from models.job import JobPosting

    job_id = event["entity"]["entity_id"]
    db = SessionLocal()
    try:
        job = db.query(JobPosting).filter(JobPosting.job_id == int(job_id)).first()
        if job:
            job.views_count = (job.views_count or 0) + 1
            db.commit()
    finally:
        db.close()

    # Also log to MongoDB
    await mongo_db.event_logs.insert_one(event)


async def handle_application_submitted(event: dict):
    """Update applicant count and log application event."""
    from database import SessionLocal
    from models.job import JobPosting

    job_id = event["payload"].get("job_id")
    if job_id:
        db = SessionLocal()
        try:
            job = db.query(JobPosting).filter(JobPosting.job_id == int(job_id)).first()
            if job:
                job.applicants_count = (job.applicants_count or 0) + 1
                db.commit()
        finally:
            db.close()

    await mongo_db.event_logs.insert_one(event)


async def handle_profile_viewed(event: dict):
    """Track profile views for analytics."""
    from database import SessionLocal
    from models.member import ProfileViewDaily
    from datetime import date

    member_id = event["entity"]["entity_id"]
    today = date.today()

    db = SessionLocal()
    try:
        view = (
            db.query(ProfileViewDaily)
            .filter(
                ProfileViewDaily.member_id == int(member_id),
                ProfileViewDaily.view_date == today,
            )
            .first()
        )
        if view:
            view.view_count += 1
        else:
            view = ProfileViewDaily(member_id=int(member_id), view_date=today, view_count=1)
            db.add(view)
        db.commit()
    finally:
        db.close()

    await mongo_db.event_logs.insert_one(event)


async def handle_generic_event(event: dict):
    """Default handler — just log to MongoDB."""
    await mongo_db.event_logs.insert_one(event)


# Singleton consumer
kafka_consumer = KafkaEventConsumer()

# Register handlers
kafka_consumer.register_handler("job.viewed", handle_job_viewed)
kafka_consumer.register_handler("job.saved", handle_generic_event)
kafka_consumer.register_handler("application.submitted", handle_application_submitted)
kafka_consumer.register_handler("message.sent", handle_generic_event)
kafka_consumer.register_handler("connection.requested", handle_generic_event)
kafka_consumer.register_handler("connection.accepted", handle_generic_event)
kafka_consumer.register_handler("profile.viewed", handle_profile_viewed)
