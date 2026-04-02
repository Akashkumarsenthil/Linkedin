"""
API smoke tests using Starlette TestClient (in-process, no manual uvicorn).

Requires infrastructure: `docker compose up -d` from repo root, and backend/.env
(or defaults) pointing at local services.
"""

from __future__ import annotations

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
