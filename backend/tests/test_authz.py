"""
Authorization integration tests.

Covers:
  1. Unauthenticated requests → 401
  2. Member blocked from recruiter-only endpoints → 403
  3. Recruiter blocked from member-only endpoints → 403
  4. Ownership violation blocked → success=False / 403
  5. Valid authorized request succeeds

Requires infrastructure: `docker compose up -d` from repo root.
"""

from __future__ import annotations

import uuid
import pytest
from fastapi.testclient import TestClient


# ── fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def client():
    from main import app
    with TestClient(app) as c:
        yield c


def _register_member(client: TestClient, suffix: str = "") -> dict:
    uid = suffix or uuid.uuid4().hex[:8]
    r = client.post("/auth/register/member", json={
        "email": f"member_{uid}@test.example",
        "password": "testpass123",
        "first_name": "Test",
        "last_name": "Member",
    })
    assert r.status_code == 200, r.text
    return r.json()


def _register_recruiter(client: TestClient, suffix: str = "") -> dict:
    uid = suffix or uuid.uuid4().hex[:8]
    r = client.post("/auth/register/recruiter", json={
        "email": f"recruiter_{uid}@test.example",
        "password": "testpass123",
        "first_name": "Test",
        "last_name": "Recruiter",
    })
    assert r.status_code == 200, r.text
    return r.json()


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def member_token(client):
    return _register_member(client)["access_token"]


@pytest.fixture(scope="module")
def recruiter_token(client):
    return _register_recruiter(client)["access_token"]


@pytest.fixture(scope="module")
def recruiter2_token(client):
    return _register_recruiter(client)["access_token"]


@pytest.fixture(scope="module")
def job_id(client, recruiter_token):
    """Create a job posting owned by recruiter_token and return its job_id."""
    r = client.post("/jobs/create", json={
        "title": "Authz Test Engineer",
        "description": "Testing RBAC",
        "location": "Remote",
        "salary_min": 80000,
        "salary_max": 120000,
        "skills_required": ["Python"],
    }, headers=_auth_header(recruiter_token))
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["success"], data
    return data["data"]["job_id"]


# ── 1. Unauthenticated blocked ────────────────────────────────────────────────

RECRUITER_ONLY_ENDPOINTS = [
    ("POST", "/jobs/create",           {"title": "x", "description": "x", "location": "x"}),
    ("POST", "/applications/byJob",    {"job_id": 1}),
    ("POST", "/analytics/jobs/top",    {"metric": "applications"}),
    ("POST", "/analytics/jobs/top-monthly", {"metric": "applications"}),
    ("POST", "/analytics/geo",         {"job_id": 1}),
    ("POST", "/analytics/geo/monthly", {"job_id": 1}),
    ("POST", "/analytics/jobs/least-applied", {}),
    ("POST", "/analytics/jobs/clicks", {}),
    ("POST", "/analytics/saves/trend", {}),
    ("POST", "/ai/analyze-candidates", {"job_id": 1}),
    ("POST", "/ai/approve",            {"task_id": "x", "approved": True}),
    ("POST", "/ai/tasks/list",         {}),
    ("GET",  "/ai/queue-status",       None),
]

MEMBER_ONLY_ENDPOINTS = [
    ("POST", "/applications/submit",   {"job_id": 1, "member_id": 1}),
    ("POST", "/jobs/save",             {"job_id": 1, "member_id": 1}),
    ("POST", "/connections/request",   {"requester_id": 1, "receiver_id": 2}),
]


@pytest.mark.integration
@pytest.mark.parametrize("method,url,body", RECRUITER_ONLY_ENDPOINTS)
def test_unauthenticated_recruiter_endpoints(client, method, url, body):
    if method == "GET":
        r = client.get(url)
    else:
        r = client.post(url, json=body or {})
    assert r.status_code == 401, f"{url} returned {r.status_code}: {r.text}"


@pytest.mark.integration
@pytest.mark.parametrize("method,url,body", MEMBER_ONLY_ENDPOINTS)
def test_unauthenticated_member_endpoints(client, method, url, body):
    r = client.post(url, json=body or {})
    assert r.status_code == 401, f"{url} returned {r.status_code}: {r.text}"


# ── 2. Member blocked from recruiter actions ──────────────────────────────────

@pytest.mark.integration
def test_member_cannot_create_job(client, member_token):
    r = client.post("/jobs/create", json={
        "title": "Unauthorized Job",
        "description": "Should fail",
        "location": "Nowhere",
    }, headers=_auth_header(member_token))
    assert r.status_code == 403, r.text


@pytest.mark.integration
def test_member_cannot_view_analytics(client, member_token):
    r = client.post("/analytics/jobs/top", json={"metric": "applications"},
                    headers=_auth_header(member_token))
    assert r.status_code == 403, r.text


@pytest.mark.integration
def test_member_cannot_start_ai_workflow(client, member_token):
    r = client.post("/ai/analyze-candidates", json={"job_id": 1},
                    headers=_auth_header(member_token))
    assert r.status_code == 403, r.text


@pytest.mark.integration
def test_member_cannot_approve_ai_task(client, member_token):
    r = client.post("/ai/approve", json={"task_id": "fake", "approved": True},
                    headers=_auth_header(member_token))
    assert r.status_code == 403, r.text


@pytest.mark.integration
def test_member_cannot_list_ai_tasks(client, member_token):
    r = client.post("/ai/tasks/list", json={}, headers=_auth_header(member_token))
    assert r.status_code == 403, r.text


@pytest.mark.integration
def test_member_cannot_close_job(client, member_token, job_id):
    r = client.post("/jobs/close", json={"job_id": job_id},
                    headers=_auth_header(member_token))
    assert r.status_code == 403, r.text


# ── 3. Recruiter blocked from member-only actions ─────────────────────────────

@pytest.mark.integration
def test_recruiter_cannot_apply_to_job(client, recruiter_token, job_id):
    r = client.post("/applications/submit", json={
        "job_id": job_id, "member_id": 9999,
    }, headers=_auth_header(recruiter_token))
    assert r.status_code == 403, r.text


@pytest.mark.integration
def test_recruiter_cannot_save_job(client, recruiter_token, job_id):
    r = client.post("/jobs/save", json={
        "job_id": job_id, "member_id": 9999,
    }, headers=_auth_header(recruiter_token))
    assert r.status_code == 403, r.text


@pytest.mark.integration
def test_recruiter_cannot_send_connection_request(client, recruiter_token):
    r = client.post("/connections/request", json={
        "requester_id": 1, "receiver_id": 2,
    }, headers=_auth_header(recruiter_token))
    assert r.status_code == 403, r.text


@pytest.mark.integration
def test_recruiter_cannot_view_member_dashboard(client, recruiter_token):
    r = client.post("/analytics/member/dashboard", json={"member_id": 1},
                    headers=_auth_header(recruiter_token))
    assert r.status_code == 403, r.text


# ── 4. Ownership violations blocked ──────────────────────────────────────────

@pytest.mark.integration
def test_recruiter2_cannot_close_recruiter1_job(client, recruiter2_token, job_id):
    r = client.post("/jobs/close", json={"job_id": job_id},
                    headers=_auth_header(recruiter2_token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert not body["success"], f"Expected ownership rejection, got: {body}"


@pytest.mark.integration
def test_recruiter2_cannot_update_recruiter1_job(client, recruiter2_token, job_id):
    r = client.post("/jobs/update", json={"job_id": job_id, "title": "Hijacked"},
                    headers=_auth_header(recruiter2_token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert not body["success"], f"Expected ownership rejection, got: {body}"


@pytest.mark.integration
def test_recruiter2_cannot_view_recruiter1_applications(client, recruiter2_token, job_id):
    r = client.post("/applications/byJob", json={"job_id": job_id},
                    headers=_auth_header(recruiter2_token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert not body["success"], f"Expected ownership rejection, got: {body}"


@pytest.mark.integration
def test_member_cannot_view_other_members_dashboard(client, client_module=None):
    """Member trying to view a different member's dashboard is rejected."""
    from main import app
    with TestClient(app) as c:
        tok1 = _register_member(c)["access_token"]
        # member_id=99999 — not this member's ID
        r = c.post("/analytics/member/dashboard", json={"member_id": 99999},
                   headers=_auth_header(tok1))
        assert r.status_code == 200, r.text
        body = r.json()
        assert not body["success"], f"Expected ownership rejection, got: {body}"


# ── 5. Valid authorized requests succeed ─────────────────────────────────────

@pytest.mark.integration
def test_recruiter_can_create_job(client, recruiter_token):
    r = client.post("/jobs/create", json={
        "title": "Valid Job",
        "description": "Legit posting",
        "location": "San Francisco, CA",
        "salary_min": 100000,
        "salary_max": 150000,
        "skills_required": ["Python", "FastAPI"],
    }, headers=_auth_header(recruiter_token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"], body


@pytest.mark.integration
def test_recruiter_can_list_ai_tasks(client, recruiter_token):
    r = client.post("/ai/tasks/list", json={}, headers=_auth_header(recruiter_token))
    assert r.status_code == 200, r.text
    assert r.json()["success"]


@pytest.mark.integration
def test_recruiter_can_get_queue_status(client, recruiter_token):
    r = client.get("/ai/queue-status", headers=_auth_header(recruiter_token))
    assert r.status_code == 200, r.text
    assert r.json()["success"]


@pytest.mark.integration
def test_recruiter_can_view_top_jobs(client, recruiter_token):
    r = client.post("/analytics/jobs/top", json={"metric": "applications"},
                    headers=_auth_header(recruiter_token))
    assert r.status_code == 200, r.text
    assert r.json()["success"]


@pytest.mark.integration
def test_member_can_apply_to_job(client, member_token, job_id):
    import jwt as pyjwt
    from auth import settings
    payload = pyjwt.decode(member_token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    member_id = payload["user_id"]
    r = client.post("/applications/submit", json={
        "job_id": job_id, "member_id": member_id,
    }, headers=_auth_header(member_token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"], body


@pytest.mark.integration
def test_member_can_view_own_dashboard(client):
    from main import app
    with TestClient(app) as c:
        reg = _register_member(c)
        tok = reg["access_token"]
        member_id = reg["user_id"]
        r = c.post("/analytics/member/dashboard", json={"member_id": member_id},
                   headers=_auth_header(tok))
        assert r.status_code == 200, r.text
        assert r.json()["success"]
