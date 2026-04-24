"""
API smoke tests using Starlette TestClient (in-process, no manual uvicorn).

Requires infrastructure: `docker compose up -d` from repo root, and backend/.env
(or defaults) pointing at local services.
"""

from __future__ import annotations

import uuid
import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    from main import app

    with TestClient(app) as c:
        yield c


@pytest.mark.integration
def test_root(client: TestClient):
    r = client.get("/")
    assert r.status_code == 200
    body = r.json()
    assert body.get("status") == "running"
    assert "docs" in body


@pytest.mark.integration
def test_health(client: TestClient):
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data.get("status") in ("healthy", "degraded")
    svc = data.get("services", {})
    assert svc.get("api") is True
    assert svc.get("mongodb") is True, (
        "MongoDB ping failed — use MONGO_PORT=27018 with this repo’s docker-compose "
        "and ensure nothing else is bound to that port."
    )


@pytest.mark.integration
def test_jobs_search(client: TestClient):
    r = client.post(
        "/jobs/search",
        json={"keyword": "engineer", "page": 1, "page_size": 5},
    )
    assert r.status_code == 200
    body = r.json()
    assert body.get("success") is True
    assert "data" in body


@pytest.mark.integration
def test_members_search(client: TestClient):
    r = client.post(
        "/members/search",
        json={"keyword": "a", "page": 1, "page_size": 5},
    )
    assert r.status_code == 200
    body = r.json()
    assert body.get("success") is True


@pytest.mark.integration
def test_ai_parse_resume_fallback(client: TestClient):
    r = client.post(
        "/ai/parse-resume",
        json={
            "resume_text": (
                "Alex Dev | Software Engineer | alex@example.com\n"
                "Python, FastAPI, AWS. 5 years building APIs."
            ),
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body.get("success") is True
    assert body.get("data") is not None


# ── AI task persistence tests ─────────────────────────────────────────────────

@pytest.mark.integration
def test_ai_task_status_unknown(client: TestClient):
    """Unknown task_id must return success:False without raising a 500."""
    r = client.post("/ai/task-status", json={"task_id": "does-not-exist-ever"})
    assert r.status_code == 200
    assert r.json().get("success") is False


@pytest.mark.integration
def test_ai_tasks_list_shape(client: TestClient):
    """/ai/tasks/list always returns a list (possibly empty)."""
    r = client.post("/ai/tasks/list", json={})
    assert r.status_code == 200
    body = r.json()
    assert body.get("success") is True
    assert isinstance(body.get("data"), list)


@pytest.mark.integration
def test_ai_task_persisted_and_survives_cache_eviction(client: TestClient):
    """
    After start_task writes to MongoDB, evicting the task from the in-memory
    cache must not make /ai/task-status return not-found.

    This simulates the post-restart scenario where active_tasks is empty but
    MongoDB still holds the task document.
    """
    from agents.hiring_assistant import active_tasks

    # Start a task (job_id=1 may or may not exist; we only care about the
    # task record being persisted, not the workflow completing successfully).
    r = client.post("/ai/analyze-candidates", json={"job_id": 1, "top_n": 1})
    assert r.status_code == 200
    body = r.json()
    assert body.get("success") is True
    task_id = body["data"]["task_id"]

    # The task must be findable immediately after creation.
    r2 = client.post("/ai/task-status", json={"task_id": task_id})
    assert r2.status_code == 200
    assert r2.json().get("success") is True

    # Simulate a restart: evict the task from the in-memory cache.
    active_tasks.pop(task_id, None)
    assert task_id not in active_tasks, "Cache eviction failed — test precondition not met"

    # /ai/task-status must still resolve the task via MongoDB.
    r3 = client.post("/ai/task-status", json={"task_id": task_id})
    assert r3.status_code == 200
    body3 = r3.json()
    assert body3.get("success") is True, (
        "task-status returned success:False after cache eviction — "
        "MongoDB fallback is broken"
    )
    assert body3["data"]["task_id"] == task_id


@pytest.mark.integration
def test_ai_task_rehydration(client: TestClient):
    """
    rehydrate_tasks() must load ``awaiting_approval`` tasks from MongoDB into
    active_tasks and mark ``running``/``queued`` tasks as ``interrupted``.

    Uses pymongo (sync) for direct DB writes to avoid event-loop conflicts
    with motor inside a synchronous pytest function.
    """
    from pymongo import MongoClient
    from datetime import datetime, timezone
    from config import settings
    from agents.hiring_assistant import active_tasks, rehydrate_tasks
    import asyncio

    sync_client = MongoClient(settings.MONGO_URL)
    db = sync_client[settings.MONGO_DATABASE]

    approval_id = f"test-rehydrate-approval-{uuid.uuid4().hex[:8]}"
    running_id = f"test-rehydrate-running-{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()

    db.agent_tasks.insert_one({
        "task_id": approval_id,
        "job_id": 9998,
        "status": "awaiting_approval",
        "created_at": now,
        "updated_at": now,
        "steps": [],
        "result": {"test": True},
    })
    db.agent_tasks.insert_one({
        "task_id": running_id,
        "job_id": 9999,
        "status": "running",
        "created_at": now,
        "updated_at": now,
        "steps": [],
    })
    sync_client.close()

    # Clear both from in-memory cache
    active_tasks.pop(approval_id, None)
    active_tasks.pop(running_id, None)

    # Run rehydration — must use asyncio.run; motor 3.x binds to the current loop
    # at operation time, so a fresh loop is safe here (no other async work running).
    count = asyncio.run(rehydrate_tasks())

    try:
        assert approval_id in active_tasks, (
            "awaiting_approval task should be in active_tasks after rehydration"
        )
        assert active_tasks[approval_id]["status"] == "awaiting_approval"

        assert running_id not in active_tasks, (
            "running task should NOT be loaded into active_tasks"
        )

        # Verify the running task was marked interrupted in MongoDB
        sync_client2 = MongoClient(settings.MONGO_URL)
        doc = sync_client2[settings.MONGO_DATABASE].agent_tasks.find_one(
            {"task_id": running_id}
        )
        sync_client2.close()
        assert doc is not None
        assert doc["status"] == "interrupted", (
            f"Expected 'interrupted', got '{doc['status']}'"
        )
    finally:
        sync_client3 = MongoClient(settings.MONGO_URL)
        sync_client3[settings.MONGO_DATABASE].agent_tasks.delete_many(
            {"task_id": {"$in": [approval_id, running_id]}}
        )
        sync_client3.close()
        active_tasks.pop(approval_id, None)
        active_tasks.pop(running_id, None)
