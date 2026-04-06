"""
Reliability tests — failure mode coverage for DATA236 LinkedIn platform.

Tests 6 failure modes:
  1. Duplicate email/user (member + recruiter)
  2. Duplicate application to same job
  3. Apply to closed job
  4. Message send failure + retry behavior
  5. Kafka consumer idempotent processing
  6. Rollback / consistency on failure (tested as part of #4 retry exhaustion)

Requires infrastructure: `docker compose up -d` from repo root.
"""

from __future__ import annotations

import uuid
import asyncio
import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient


# ── Shared fixture ────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def client():
    from main import app
    with TestClient(app) as c:
        yield c


# ── Helpers ───────────────────────────────────────────────────────────────────

def _unique_email(prefix: str = "user") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}@reliability.test"


def _create_member(client: TestClient, email: str | None = None) -> dict:
    email = email or _unique_email("member")
    r = client.post("/members/create", json={
        "first_name": "Test",
        "last_name": "User",
        "email": email,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True, f"Member creation failed: {body}"
    return body["data"]


def _create_recruiter(client: TestClient, email: str | None = None) -> dict:
    email = email or _unique_email("recruiter")
    r = client.post("/recruiters/create", json={
        "first_name": "Test",
        "last_name": "Recruiter",
        "email": email,
        "company_name": "TestCo",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True, f"Recruiter creation failed: {body}"
    return body["data"]


def _create_job(client: TestClient, recruiter_id: int, status: str = "open") -> dict:
    r = client.post("/jobs/create", json={
        "recruiter_id": recruiter_id,
        "title": "Test Engineer",
        "description": "Reliability test job",
        "employment_type": "full_time",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True, f"Job creation failed: {body}"
    job = body["data"]

    if status == "closed":
        rc = client.post("/jobs/close", json={"job_id": job["job_id"]})
        assert rc.status_code == 200
        assert rc.json()["success"] is True

    return job


def _delete_member(client: TestClient, member_id: int):
    client.post("/members/delete", json={"member_id": member_id})


def _delete_recruiter(client: TestClient, recruiter_id: int):
    client.post("/recruiters/delete", json={"recruiter_id": recruiter_id})


# ── 1. Duplicate email / user ─────────────────────────────────────────────────

@pytest.mark.integration
def test_duplicate_member_email(client: TestClient):
    """Registering two members with the same email must return success:False on the second call."""
    email = _unique_email("dup_member")
    first = _create_member(client, email)
    member_id = first["member_id"]

    try:
        r = client.post("/members/create", json={
            "first_name": "Dupe",
            "last_name": "User",
            "email": email,
        })
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is False, "Expected success:False for duplicate email"
        assert "already exists" in body["message"].lower() or "email" in body["message"].lower()

        # Confirm DB-level count = 1
        from database import SessionLocal
        from models.member import Member
        db = SessionLocal()
        try:
            count = db.query(Member).filter(Member.email == email).count()
            assert count == 1, f"Expected 1 member with this email, found {count}"
        finally:
            db.close()
    finally:
        _delete_member(client, member_id)


@pytest.mark.integration
def test_duplicate_recruiter_email(client: TestClient):
    """Registering two recruiters with the same email must return success:False on the second call."""
    email = _unique_email("dup_recruiter")
    first = _create_recruiter(client, email)
    recruiter_id = first["recruiter_id"]

    try:
        r = client.post("/recruiters/create", json={
            "first_name": "Dupe",
            "last_name": "Recruiter",
            "email": email,
            "company_name": "DupeCo",
        })
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is False, "Expected success:False for duplicate recruiter email"
        assert "already exists" in body["message"].lower() or "email" in body["message"].lower()

        from database import SessionLocal
        from models.recruiter import Recruiter
        db = SessionLocal()
        try:
            count = db.query(Recruiter).filter(Recruiter.email == email).count()
            assert count == 1, f"Expected 1 recruiter with this email, found {count}"
        finally:
            db.close()
    finally:
        _delete_recruiter(client, recruiter_id)


# ── 2. Duplicate application to same job ──────────────────────────────────────

@pytest.mark.integration
def test_duplicate_application(client: TestClient):
    """Submitting a second application to the same job must return success:False."""
    recruiter = _create_recruiter(client)
    member = _create_member(client)
    recruiter_id = recruiter["recruiter_id"]
    member_id = member["member_id"]

    try:
        job = _create_job(client, recruiter_id)
        job_id = job["job_id"]

        payload = {"job_id": job_id, "member_id": member_id}

        r1 = client.post("/applications/submit", json=payload)
        assert r1.status_code == 200
        assert r1.json()["success"] is True, f"First application failed: {r1.json()}"

        r2 = client.post("/applications/submit", json=payload)
        assert r2.status_code == 200
        body2 = r2.json()
        assert body2["success"] is False, "Expected success:False for duplicate application"
        assert "already applied" in body2["message"].lower() or "already" in body2["message"].lower()

        # DB-level: exactly 1 application for this member+job
        from database import SessionLocal
        from models.application import Application
        db = SessionLocal()
        try:
            count = db.query(Application).filter(
                Application.job_id == job_id,
                Application.member_id == member_id,
            ).count()
            assert count == 1, f"Expected 1 application, found {count}"
        finally:
            db.close()
    finally:
        _delete_member(client, member_id)   # CASCADE deletes applications
        _delete_recruiter(client, recruiter_id)  # CASCADE deletes jobs


# ── 3. Apply to closed job ────────────────────────────────────────────────────

@pytest.mark.integration
def test_apply_to_closed_job(client: TestClient):
    """Applying to a closed job must return success:False and create no application row."""
    recruiter = _create_recruiter(client)
    member = _create_member(client)
    recruiter_id = recruiter["recruiter_id"]
    member_id = member["member_id"]

    try:
        job = _create_job(client, recruiter_id, status="closed")
        job_id = job["job_id"]

        r = client.post("/applications/submit", json={
            "job_id": job_id,
            "member_id": member_id,
        })
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is False, "Expected success:False when applying to closed job"
        assert "closed" in body["message"].lower()

        from database import SessionLocal
        from models.application import Application
        db = SessionLocal()
        try:
            count = db.query(Application).filter(
                Application.job_id == job_id,
                Application.member_id == member_id,
            ).count()
            assert count == 0, f"Expected 0 applications for closed job, found {count}"
        finally:
            db.close()
    finally:
        _delete_member(client, member_id)
        _delete_recruiter(client, recruiter_id)


# ── 4 + 6. Message send success baseline and retry / rollback exhaustion ──────

@pytest.mark.integration
def test_message_send_success_and_db_state(client: TestClient):
    """Happy path: sending a message creates exactly 1 Message row."""
    member = _create_member(client)
    member_id = member["member_id"]

    try:
        r_thread = client.post("/threads/open", json={
            "subject": "Reliability test thread",
            "participant_ids": [{"user_id": member_id, "user_type": "member"}],
        })
        assert r_thread.status_code == 200
        thread_id = r_thread.json()["data"]["thread_id"]

        r_send = client.post("/messages/send", json={
            "thread_id": thread_id,
            "sender_id": member_id,
            "sender_type": "member",
            "message_text": "Hello, reliability test!",
        })
        assert r_send.status_code == 200
        body = r_send.json()
        assert body["success"] is True, f"Message send failed: {body}"

        from database import SessionLocal
        from models.message import Message
        db = SessionLocal()
        try:
            count = db.query(Message).filter(Message.thread_id == thread_id).count()
            assert count == 1, f"Expected 1 message in thread, found {count}"
        finally:
            db.close()
    finally:
        _delete_member(client, member_id)


@pytest.mark.integration
def test_message_send_retry_exhausted(client: TestClient):
    """
    When db.commit() always raises, the retry loop exhausts 3 attempts,
    rolls back each time, and the endpoint returns success:False with 0
    messages persisted to the database.
    """
    from main import app
    from database import get_db, SessionLocal
    from models.message import Message, Thread, ThreadParticipant

    # Set up a thread and participant using a real DB session (outside the override)
    member = _create_member(client)
    member_id = member["member_id"]

    setup_db = SessionLocal()
    try:
        thread = Thread(subject="Retry exhaustion test")
        setup_db.add(thread)
        setup_db.flush()
        thread_id = thread.thread_id

        tp = ThreadParticipant(
            thread_id=thread_id,
            user_id=member_id,
            user_type="member",
        )
        setup_db.add(tp)
        setup_db.commit()
    finally:
        setup_db.close()

    # Track commit and rollback calls
    state = {"commits": 0, "rollbacks": 0}

    def override_get_db():
        db = SessionLocal()
        original_commit = db.commit
        original_rollback = db.rollback

        def patched_commit():
            # Only raise inside the message-send retry loop (after thread/participant exist)
            state["commits"] += 1
            raise RuntimeError("Simulated DB commit failure")

        def patched_rollback():
            state["rollbacks"] += 1
            original_rollback()

        db.commit = patched_commit
        db.rollback = patched_rollback
        try:
            yield db
        finally:
            db.commit = original_commit
            db.rollback = original_rollback
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        r = client.post("/messages/send", json={
            "thread_id": thread_id,
            "sender_id": member_id,
            "sender_type": "member",
            "message_text": "This should never be stored.",
        })
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is False, f"Expected success:False after retry exhaustion, got: {body}"

        # Verify retry loop made exactly 3 commit attempts
        assert state["commits"] == 3, (
            f"Expected 3 commit attempts, got {state['commits']}"
        )
        # Verify each failure triggered a rollback
        assert state["rollbacks"] == 3, (
            f"Expected 3 rollbacks, got {state['rollbacks']}"
        )

        # Verify no message was written to DB
        verify_db = SessionLocal()
        try:
            count = verify_db.query(Message).filter(Message.thread_id == thread_id).count()
            assert count == 0, f"Expected 0 messages after retry exhaustion, found {count}"
        finally:
            verify_db.close()
    finally:
        app.dependency_overrides.pop(get_db, None)
        _delete_member(client, member_id)


# ── 5. Kafka consumer idempotent processing ───────────────────────────────────

@pytest.mark.integration
def test_kafka_consumer_idempotency(client: TestClient):
    """
    Delivering the same event twice to the Kafka consumer must call the handler
    only once. Uses an async mock iterator to avoid a real Kafka broker.
    """
    from kafka_consumer import KafkaEventConsumer
    from database import mongo_db

    idempotency_key = f"test-idem-{uuid.uuid4().hex}"
    event = {
        "event_type": "job.viewed",
        "idempotency_key": idempotency_key,
        "entity": {"entity_id": "99999"},
        "payload": {},
    }

    handler_calls = {"count": 0}

    async def mock_handler(e: dict):
        handler_calls["count"] += 1

    # Build an async iterable that yields the same event twice
    class _MockMessage:
        def __init__(self, value):
            self.value = value

    class _MockAsyncIterator:
        def __init__(self, messages):
            self._messages = iter(messages)

        def __aiter__(self):
            return self

        async def __anext__(self):
            try:
                return next(self._messages)
            except StopIteration:
                raise StopAsyncIteration

    async def run_test():
        consumer = KafkaEventConsumer()
        consumer._running = True
        consumer.register_handler("job.viewed", mock_handler)

        messages = [
            _MockMessage(event),
            _MockMessage(event),  # duplicate
        ]

        # Patch consumer.consumer with a mock whose __aiter__ returns our messages
        mock_aiokafka = type("MockConsumer", (), {
            "__aiter__": lambda self: _MockAsyncIterator(messages),
        })()
        consumer.consumer = mock_aiokafka

        # Ensure MongoDB doesn't have this key from a prior test run
        await mongo_db.processed_events.delete_many({"idempotency_key": idempotency_key})

        await consumer.consume()

        # Cleanup MongoDB
        await mongo_db.processed_events.delete_many({"idempotency_key": idempotency_key})

    asyncio.run(run_test())

    assert handler_calls["count"] == 1, (
        f"Handler was called {handler_calls['count']} times for a duplicate event; "
        "expected exactly 1"
    )
