"""
LinkedIn Platform — Kafka Consumer
Consumes domain events from Kafka topics with idempotent processing and manual offset commit.

Delivery semantics (at-least-once)
-----------------------------------
enable_auto_commit is disabled.  Offsets are committed manually — only after a message
has been fully processed (handler executed + idempotency record written to MongoDB) or
after it has been skipped via the idempotency check (already processed, safe to advance).

If the handler raises an exception the offset is intentionally NOT committed.  On the
next consumer start the broker will redeliver the message from the last committed offset.
The idempotency layer (in-memory set + MongoDB) ensures re-delivery does not cause
duplicate side-effects if the message was partially processed before the crash.

Commit errors are logged but do not propagate — a failed commit means the offset may be
recommitted on the next successful delivery, which is handled by idempotency.

Poison pill protection
----------------------
A message that permanently fails (bad data, downstream unavailable, schema error) would
block the consumer forever if the offset is never committed.  To prevent this, delivery
attempts are tracked per idempotency_key in the MongoDB `processing_attempts` collection.
After MAX_DELIVERY_ATTEMPTS failures the message is routed to `dead_letters` and the
offset is committed, unblocking the partition.  The dead-letter document contains the
full event for manual inspection and replay.
"""

import json
import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, Callable, Set
from aiokafka import AIOKafkaConsumer
from config import settings
from database import mongo_db

logger = logging.getLogger(__name__)

MAX_DELIVERY_ATTEMPTS = 3   # poison pill threshold


class KafkaEventConsumer:
    """Async Kafka consumer with idempotent processing and manual offset commit."""

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
            enable_auto_commit=False,          # offsets committed manually after processing
            session_timeout_ms=10000,
            heartbeat_interval_ms=3000,
            request_timeout_ms=15000,
        )
        await asyncio.wait_for(self.consumer.start(), timeout=20)
        self._running = True
        logger.info(f"Kafka consumer started (manual commit). Listening on: {topics}")

    async def stop(self):
        """Stop the consumer."""
        self._running = False
        if self.consumer:
            await self.consumer.stop()

    async def _commit(self, message) -> None:
        """
        Commit the offset for *message* (offset + 1, i.e. the next-to-fetch position).

        Calls consumer.commit() with no arguments, which commits the last polled offset
        for every assigned partition.  Because we process messages sequentially in a
        single async loop, this always corresponds to exactly the message we just handled.

        Commit failures are logged as warnings and do not re-raise — the worst outcome is
        that the offset is recommitted on the next successful delivery, which the
        idempotency layer handles without side-effects.
        """
        try:
            await self.consumer.commit()
        except Exception as e:
            logger.warning(
                f"Offset commit failed for {message.topic}:{message.partition}:{message.offset} — {e}"
            )

    async def _get_and_increment_attempts(self, idempotency_key: str, event_type: str) -> int:
        """
        Atomically increment and return the delivery attempt count for an event.
        Uses MongoDB findOneAndUpdate for atomic read-increment.
        Returns the new attempt count (1 on first attempt).
        """
        doc = await mongo_db.processing_attempts.find_one_and_update(
            {"idempotency_key": idempotency_key},
            {
                "$inc": {"attempts": 1},
                "$setOnInsert": {
                    "event_type": event_type,
                    "first_seen": datetime.now(timezone.utc).isoformat(),
                },
            },
            upsert=True,
            return_document=True,   # return the document AFTER the update
        )
        return doc.get("attempts", 1) if doc else 1

    async def consume(self):
        """Main consumption loop with idempotent processing and manual commit."""
        if not self.consumer:
            raise RuntimeError("Consumer not started")

        try:
            async for message in self.consumer:
                if not self._running:
                    break

                event = message.value
                event_type = event.get("event_type", "unknown")
                idempotency_key = event.get("idempotency_key", "")

                # ── In-memory idempotency check ───────────────────────────────
                # Commit and skip: the event was already handled in this process
                # lifetime; advancing the offset is safe.
                if idempotency_key in self.processed_keys:
                    logger.info(f"Skipping duplicate event (in-memory): {idempotency_key}")
                    await self._commit(message)
                    continue

                # ── Persistent idempotency check (survives restarts) ──────────
                existing = await mongo_db.processed_events.find_one(
                    {"idempotency_key": idempotency_key}
                )
                if existing:
                    logger.info(f"Skipping already-processed event (mongo): {idempotency_key}")
                    self.processed_keys.add(idempotency_key)
                    await self._commit(message)
                    continue

                # ── Poison-pill guard — check delivery attempt count ──────────
                # If this message has failed MAX_DELIVERY_ATTEMPTS times already,
                # route it to dead_letters and advance the offset so the partition
                # is not blocked indefinitely.
                attempt_doc = await mongo_db.processing_attempts.find_one(
                    {"idempotency_key": idempotency_key}
                )
                prior_attempts = attempt_doc.get("attempts", 0) if attempt_doc else 0

                if prior_attempts >= MAX_DELIVERY_ATTEMPTS:
                    logger.error(
                        f"Dead-lettering {event_type} ({idempotency_key}) after "
                        f"{prior_attempts} failed attempts — offset committed to unblock partition"
                    )
                    await mongo_db.dead_letters.insert_one({
                        **event,
                        "dead_lettered_at": datetime.now(timezone.utc).isoformat(),
                        "reason": f"exceeded {MAX_DELIVERY_ATTEMPTS} delivery attempts",
                    })
                    await self._commit(message)
                    continue

                # ── Dispatch to registered handler ────────────────────────────
                handler = self.handlers.get(event_type)
                if handler:
                    try:
                        await handler(event)
                        # Persist idempotency record before committing offset so
                        # that a crash between these two writes causes a re-delivery
                        # that the idempotency check will catch, not a silent loss.
                        self.processed_keys.add(idempotency_key)
                        await mongo_db.processed_events.insert_one(
                            {"idempotency_key": idempotency_key, "event_type": event_type}
                        )
                        logger.info(f"Processed event: {event_type} ({idempotency_key})")
                        # Commit offset only after full, successful processing.
                        await self._commit(message)
                    except Exception as e:
                        # Increment the attempt counter so the poison-pill guard
                        # can detect repeated failures and eventually dead-letter.
                        await self._get_and_increment_attempts(idempotency_key, event_type)
                        # Do NOT commit — offset stays at this message so it will be
                        # redelivered from Kafka on the next consumer start.
                        logger.error(
                            f"Error processing {event_type} ({idempotency_key}): {e} — "
                            f"attempt {prior_attempts + 1}/{MAX_DELIVERY_ATTEMPTS}; "
                            "offset NOT committed; message will be redelivered"
                        )
                else:
                    # No handler registered: log for observability and advance offset.
                    # We do not want to block the consumer indefinitely on unknown types.
                    await mongo_db.event_logs.insert_one(event)
                    logger.debug(f"No handler for event type: {event_type}")
                    await self._commit(message)

        except asyncio.CancelledError:
            logger.info("Consumer loop cancelled")
        except Exception as e:
            logger.error(f"Consumer error: {e}")


# ── Event handler functions ─────────────────────────────────────────────────

async def handle_job_viewed(event: dict):
    """
    Update job view count when a job.viewed event is received.

    Uses an atomic SQL UPDATE (SET views_count = views_count + 1) instead of
    a read-modify-write to prevent lost updates under concurrent load.
    """
    from database import SessionLocal
    from models.job import JobPosting
    from sqlalchemy import update
    from datetime import date

    job_id = int(event["entity"]["entity_id"])

    db = SessionLocal()
    try:
        # Atomic increment — no read-modify-write race
        db.execute(
            update(JobPosting)
            .where(JobPosting.job_id == job_id)
            .values(views_count=JobPosting.views_count + 1)
        )
        db.commit()
    finally:
        db.close()

    # Also log to MongoDB
    await mongo_db.event_logs.insert_one(event)

    # Upsert into pre-aggregated daily click summary
    today = str(date.today())
    await mongo_db.analytics_job_clicks_daily.update_one(
        {"job_id": job_id, "date": today},
        {"$inc": {"clicks": 1}},
        upsert=True,
    )


async def handle_application_submitted(event: dict):
    """
    Log application event to MongoDB.

    NOTE: applicants_count is already atomically incremented in the HTTP handler
    (routers/applications.py) at the time the application is committed to MySQL.
    This consumer handler must NOT increment it again — doing so would double-count
    every application.
    """
    await mongo_db.event_logs.insert_one(event)


async def handle_profile_viewed(event: dict):
    """
    Track profile views for analytics.

    Uses an atomic upsert pattern for the daily view count to prevent
    read-modify-write races under concurrent load.
    """
    from database import SessionLocal
    from models.member import ProfileViewDaily
    from sqlalchemy import update
    from datetime import date

    member_id = int(event["entity"]["entity_id"])
    today = date.today()

    db = SessionLocal()
    try:
        # Try atomic increment first
        rows_updated = db.execute(
            update(ProfileViewDaily)
            .where(
                ProfileViewDaily.member_id == member_id,
                ProfileViewDaily.view_date == today,
            )
            .values(view_count=ProfileViewDaily.view_count + 1)
        ).rowcount

        if rows_updated == 0:
            # Row doesn't exist yet — insert it
            try:
                view = ProfileViewDaily(member_id=member_id, view_date=today, view_count=1)
                db.add(view)
                db.commit()
            except Exception:
                # Another concurrent request already inserted the row
                db.rollback()
                db.execute(
                    update(ProfileViewDaily)
                    .where(
                        ProfileViewDaily.member_id == member_id,
                        ProfileViewDaily.view_date == today,
                    )
                    .values(view_count=ProfileViewDaily.view_count + 1)
                )
                db.commit()
        else:
            db.commit()
    finally:
        db.close()

    await mongo_db.event_logs.insert_one(event)


async def handle_job_saved(event: dict):
    """
    Log a job.saved event and upsert into the pre-aggregated daily saves summary.

    Pre-aggregation target: analytics_saves_daily
      { date: "YYYY-MM-DD", week: "YYYY-WNN", saves: <int> }
    The saves_trend analytics endpoint reads from this collection instead of
    scanning saved_jobs in MySQL, making it O(days) rather than O(rows).
    """
    from datetime import date

    await mongo_db.event_logs.insert_one(event)

    today = date.today()
    today_str = str(today)
    # ISO week label, e.g. "2026-W14"
    week_str = today.strftime("%G-W%V")

    await mongo_db.analytics_saves_daily.update_one(
        {"date": today_str},
        {"$inc": {"saves": 1}, "$set": {"week": week_str}},
        upsert=True,
    )


async def handle_generic_event(event: dict):
    """Default handler — just log to MongoDB."""
    await mongo_db.event_logs.insert_one(event)


# Singleton consumer
kafka_consumer = KafkaEventConsumer()

# Register handlers
kafka_consumer.register_handler("job.viewed", handle_job_viewed)
kafka_consumer.register_handler("job.saved", handle_job_saved)
kafka_consumer.register_handler("application.submitted", handle_application_submitted)
kafka_consumer.register_handler("message.sent", handle_generic_event)
kafka_consumer.register_handler("connection.requested", handle_generic_event)
kafka_consumer.register_handler("connection.accepted", handle_generic_event)
kafka_consumer.register_handler("profile.viewed", handle_profile_viewed)
