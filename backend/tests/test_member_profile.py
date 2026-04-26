"""
Member Profile — Comprehensive Integration Test Suite

Covers:
  1. Auth flows: register, duplicate email, login, invalid login, /auth/me
  2. Member CRUD: get, update, delete
  3. Full-field persistence: about, skills, experience, education, photo, resume
  4. Authorization: cross-member ownership checks
  5. End-to-end flow: register → login → fetch → update → verify → delete
  6. Dashboard: payload shape and metrics correctness

Requires: docker compose up -d (MySQL, Redis, Kafka, Mongo running)
"""

from __future__ import annotations

import uuid
import pytest
from fastapi.testclient import TestClient


# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def client():
    from main import app
    with TestClient(app) as c:
        yield c


def _unique_email(prefix: str = "member") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}@test.example"


def _register_member(client: TestClient, email: str | None = None, **overrides) -> dict:
    payload = {
        "email": email or _unique_email(),
        "password": "testpass123",
        "first_name": "Test",
        "last_name": "Member",
        **overrides,
    }
    r = client.post("/auth/register/member", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ═══════════════════════════════════════════════════════════════════════════════
# 1. AUTH FLOWS
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.integration
class TestMemberAuth:
    """Registration, login, and /auth/me tests."""

    def test_register_success(self, client):
        email = _unique_email()
        r = client.post("/auth/register/member", json={
            "email": email,
            "password": "testpass123",
            "first_name": "Alice",
            "last_name": "Wonderland",
            "headline": "ML Engineer",
        })
        assert r.status_code == 201
        body = r.json()
        assert body["access_token"]
        assert body["user_type"] == "member"
        assert body["email"] == email
        assert isinstance(body["user_id"], int)

    def test_register_duplicate_email(self, client):
        email = _unique_email()
        _register_member(client, email=email)
        # Second registration with same email should fail
        r = client.post("/auth/register/member", json={
            "email": email,
            "password": "testpass123",
            "first_name": "Dup",
            "last_name": "User",
        })
        assert r.status_code == 409
        assert "already" in r.json()["detail"].lower()

    def test_login_valid(self, client):
        email = _unique_email()
        _register_member(client, email=email)
        r = client.post("/auth/login", json={
            "email": email,
            "password": "testpass123",
        })
        assert r.status_code == 200
        body = r.json()
        assert body["access_token"]
        assert body["user_type"] == "member"
        assert body["email"] == email

    def test_login_invalid_password(self, client):
        email = _unique_email()
        _register_member(client, email=email)
        r = client.post("/auth/login", json={
            "email": email,
            "password": "wrongpassword",
        })
        assert r.status_code == 401

    def test_login_nonexistent_email(self, client):
        r = client.post("/auth/login", json={
            "email": "nobody_exists@test.example",
            "password": "testpass123",
        })
        assert r.status_code == 401

    def test_auth_me_response_shape(self, client):
        reg = _register_member(client)
        r = client.get("/auth/me", headers=_auth(reg["access_token"]))
        assert r.status_code == 200
        body = r.json()
        assert body["user_type"] == "member"
        assert body["user_id"] == reg["user_id"]
        assert body["email"] == reg["email"]
        # Profile must contain core member fields
        profile = body["profile"]
        assert "first_name" in profile
        assert "last_name" in profile
        assert "email" in profile
        assert "member_id" in profile
        assert "headline" in profile
        assert "about" in profile
        assert "skills" in profile
        assert "experience" in profile
        assert "education" in profile
        assert "profile_photo_url" in profile
        assert "resume_text" in profile
        assert "connections_count" in profile
        assert "profile_views" in profile

    def test_auth_me_unauthenticated(self, client):
        r = client.get("/auth/me")
        assert r.status_code == 401


# ═══════════════════════════════════════════════════════════════════════════════
# 2. MEMBER CRUD
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.integration
class TestMemberCRUD:
    """Get, update, delete operations."""

    def test_get_member(self, client):
        reg = _register_member(client)
        r = client.post("/members/get", json={"member_id": reg["user_id"]})
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is True
        assert body["data"]["member_id"] == reg["user_id"]
        assert body["data"]["first_name"] == "Test"

    def test_get_member_not_found(self, client):
        r = client.post("/members/get", json={"member_id": 999999})
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is False
        assert "not found" in body["message"].lower()

    def test_update_member_basic(self, client):
        reg = _register_member(client)
        token = reg["access_token"]
        mid = reg["user_id"]

        r = client.post("/members/update", json={
            "member_id": mid,
            "headline": "Updated Headline",
            "about": "This is my updated about section.",
            "phone": "+1-555-9999",
            "location_country": "Canada",
        }, headers=_auth(token))
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is True
        assert body["data"]["headline"] == "Updated Headline"
        assert body["data"]["about"] == "This is my updated about section."
        assert body["data"]["phone"] == "+1-555-9999"
        assert body["data"]["location_country"] == "Canada"

    def test_delete_member(self, client):
        reg = _register_member(client)
        token = reg["access_token"]
        mid = reg["user_id"]

        # Delete
        r = client.post("/members/delete", json={"member_id": mid},
                         headers=_auth(token))
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is True

        # Verify deleted
        r2 = client.post("/members/get", json={"member_id": mid})
        assert r2.status_code == 200
        assert r2.json()["success"] is False

    def test_update_unauthenticated(self, client):
        r = client.post("/members/update", json={
            "member_id": 1,
            "headline": "Hacked",
        })
        assert r.status_code == 401

    def test_delete_unauthenticated(self, client):
        r = client.post("/members/delete", json={"member_id": 1})
        assert r.status_code == 401


# ═══════════════════════════════════════════════════════════════════════════════
# 3. FULL-FIELD PERSISTENCE
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.integration
class TestFieldPersistence:
    """Verify all required member fields persist correctly after update."""

    def test_about_persists(self, client):
        reg = _register_member(client)
        token, mid = reg["access_token"], reg["user_id"]

        about_text = "Passionate about building scalable systems. 10+ years in distributed computing."
        client.post("/members/update", json={
            "member_id": mid, "about": about_text,
        }, headers=_auth(token))

        r = client.post("/members/get", json={"member_id": mid})
        assert r.json()["data"]["about"] == about_text

    def test_skills_persist(self, client):
        reg = _register_member(client)
        token, mid = reg["access_token"], reg["user_id"]

        skills = ["Python", "FastAPI", "Kafka", "Redis"]
        client.post("/members/update", json={
            "member_id": mid, "skills": skills,
        }, headers=_auth(token))

        r = client.post("/members/get", json={"member_id": mid})
        returned_skills = r.json()["data"]["skills"]
        # Skills should come back as a list (JSON column)
        if isinstance(returned_skills, str):
            import json
            returned_skills = json.loads(returned_skills)
        assert set(returned_skills) == set(skills)

    def test_experience_persists(self, client):
        reg = _register_member(client)
        token, mid = reg["access_token"], reg["user_id"]

        experience = [
            {"title": "Senior SWE", "company": "Google", "years": 3},
            {"title": "SWE", "company": "Stripe", "years": 2},
        ]
        client.post("/members/update", json={
            "member_id": mid, "experience": experience,
        }, headers=_auth(token))

        r = client.post("/members/get", json={"member_id": mid})
        returned_exp = r.json()["data"]["experience"]
        if isinstance(returned_exp, str):
            import json
            returned_exp = json.loads(returned_exp)
        assert len(returned_exp) == 2
        assert returned_exp[0]["title"] == "Senior SWE"
        assert returned_exp[1]["company"] == "Stripe"

    def test_education_persists(self, client):
        reg = _register_member(client)
        token, mid = reg["access_token"], reg["user_id"]

        education = [
            {"degree": "MS", "field": "Computer Science", "school": "Stanford", "year": 2020},
        ]
        client.post("/members/update", json={
            "member_id": mid, "education": education,
        }, headers=_auth(token))

        r = client.post("/members/get", json={"member_id": mid})
        returned_edu = r.json()["data"]["education"]
        if isinstance(returned_edu, str):
            import json
            returned_edu = json.loads(returned_edu)
        assert len(returned_edu) == 1
        assert returned_edu[0]["school"] == "Stanford"
        assert returned_edu[0]["year"] == 2020

    def test_profile_photo_url_persists(self, client):
        reg = _register_member(client)
        token, mid = reg["access_token"], reg["user_id"]

        photo_url = "https://example.com/photo.jpg"
        client.post("/members/update", json={
            "member_id": mid, "profile_photo_url": photo_url,
        }, headers=_auth(token))

        r = client.post("/members/get", json={"member_id": mid})
        assert r.json()["data"]["profile_photo_url"] == photo_url

    def test_resume_text_persists(self, client):
        reg = _register_member(client)
        token, mid = reg["access_token"], reg["user_id"]

        resume = "Experienced engineer with 8+ years building APIs and microservices."
        client.post("/members/update", json={
            "member_id": mid, "resume_text": resume,
        }, headers=_auth(token))

        r = client.post("/members/get", json={"member_id": mid})
        assert r.json()["data"]["resume_text"] == resume

    def test_all_fields_update_at_once(self, client):
        """Update every editable field in a single request and verify persistence."""
        reg = _register_member(client)
        token, mid = reg["access_token"], reg["user_id"]

        payload = {
            "member_id": mid,
            "first_name": "Updated",
            "last_name": "Person",
            "headline": "Staff Engineer",
            "about": "Full about text here.",
            "phone": "+1-555-1234",
            "location_city": "Seattle",
            "location_state": "Washington",
            "location_country": "USA",
            "skills": ["Go", "Rust", "K8s"],
            "experience": [{"title": "Staff Eng", "company": "Meta", "years": 4}],
            "education": [{"degree": "PhD", "field": "ML", "school": "MIT", "year": 2018}],
            "profile_photo_url": "https://cdn.example.com/photo.webp",
            "resume_text": "PhD researcher turned engineer.",
        }
        r = client.post("/members/update", json=payload, headers=_auth(token))
        assert r.status_code == 200
        assert r.json()["success"] is True

        # Verify via fresh GET
        r2 = client.post("/members/get", json={"member_id": mid})
        data = r2.json()["data"]
        assert data["first_name"] == "Updated"
        assert data["last_name"] == "Person"
        assert data["headline"] == "Staff Engineer"
        assert data["about"] == "Full about text here."
        assert data["phone"] == "+1-555-1234"
        assert data["location_city"] == "Seattle"
        assert data["location_state"] == "Washington"
        assert data["location_country"] == "USA"
        assert data["resume_text"] == "PhD researcher turned engineer."
        assert data["profile_photo_url"] == "https://cdn.example.com/photo.webp"

        # Structured fields
        skills = data["skills"]
        if isinstance(skills, str):
            import json
            skills = json.loads(skills)
        assert set(skills) == {"Go", "Rust", "K8s"}

        exp = data["experience"]
        if isinstance(exp, str):
            import json
            exp = json.loads(exp)
        assert exp[0]["company"] == "Meta"

        edu = data["education"]
        if isinstance(edu, str):
            import json
            edu = json.loads(edu)
        assert edu[0]["school"] == "MIT"


# ═══════════════════════════════════════════════════════════════════════════════
# 4. AUTHORIZATION
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.integration
class TestMemberAuthorization:
    """Ownership and role-based access checks."""

    def test_cannot_update_other_members_profile(self, client):
        reg1 = _register_member(client)
        reg2 = _register_member(client)

        r = client.post("/members/update", json={
            "member_id": reg2["user_id"],
            "headline": "Hijacked",
        }, headers=_auth(reg1["access_token"]))
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is False
        assert "cannot" in body["message"].lower()

    def test_cannot_delete_other_members_profile(self, client):
        reg1 = _register_member(client)
        reg2 = _register_member(client)

        r = client.post("/members/delete", json={
            "member_id": reg2["user_id"],
        }, headers=_auth(reg1["access_token"]))
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is False
        assert "cannot" in body["message"].lower()

    def test_recruiter_cannot_update_member(self, client):
        """Recruiter role should be blocked from member update endpoint."""
        reg_member = _register_member(client)
        # Register a recruiter
        rec = client.post("/auth/register/recruiter", json={
            "email": _unique_email("recruiter"),
            "password": "testpass123",
            "first_name": "Rec",
            "last_name": "Ruiter",
        })
        assert rec.status_code == 201
        rec_token = rec.json()["access_token"]

        r = client.post("/members/update", json={
            "member_id": reg_member["user_id"],
            "headline": "Recruiter Hack",
        }, headers=_auth(rec_token))
        assert r.status_code == 403

    def test_recruiter_cannot_delete_member(self, client):
        reg_member = _register_member(client)
        rec = client.post("/auth/register/recruiter", json={
            "email": _unique_email("recruiter"),
            "password": "testpass123",
            "first_name": "Rec",
            "last_name": "Ruiter",
        })
        assert rec.status_code == 201
        rec_token = rec.json()["access_token"]

        r = client.post("/members/delete", json={
            "member_id": reg_member["user_id"],
        }, headers=_auth(rec_token))
        assert r.status_code == 403


# ═══════════════════════════════════════════════════════════════════════════════
# 5. END-TO-END MEMBER FLOW
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.integration
class TestMemberEndToEnd:
    """Full lifecycle: register → login → fetch → update → verify → delete."""

    def test_full_member_lifecycle(self, client):
        email = _unique_email("lifecycle")

        # 1. Register
        reg = client.post("/auth/register/member", json={
            "email": email,
            "password": "lifecycle123",
            "first_name": "Life",
            "last_name": "Cycle",
            "headline": "New hire",
        })
        assert reg.status_code == 201
        reg_data = reg.json()
        token = reg_data["access_token"]
        mid = reg_data["user_id"]

        # 2. Login (verify credentials work independently)
        login = client.post("/auth/login", json={
            "email": email,
            "password": "lifecycle123",
        })
        assert login.status_code == 200
        login_token = login.json()["access_token"]

        # 3. Fetch own profile via /auth/me
        me = client.get("/auth/me", headers=_auth(login_token))
        assert me.status_code == 200
        me_data = me.json()
        assert me_data["user_id"] == mid
        assert me_data["profile"]["first_name"] == "Life"

        # 4. Fetch via /members/get
        get_r = client.post("/members/get", json={"member_id": mid})
        assert get_r.status_code == 200
        assert get_r.json()["success"] is True
        assert get_r.json()["data"]["headline"] == "New hire"

        # 5. Update profile with rich data
        update_payload = {
            "member_id": mid,
            "headline": "Senior Engineer",
            "about": "Building the future.",
            "phone": "+1-555-0001",
            "location_city": "San Jose",
            "location_state": "California",
            "location_country": "USA",
            "skills": ["Python", "Kafka", "Docker"],
            "experience": [
                {"title": "SWE", "company": "StartupCo", "years": 2},
                {"title": "Senior SWE", "company": "BigCorp", "years": 3},
            ],
            "education": [
                {"degree": "BS", "field": "CS", "school": "SJSU", "year": 2019},
            ],
            "resume_text": "5 years of backend engineering experience.",
            "profile_photo_url": "https://example.com/avatar.jpg",
        }
        upd = client.post("/members/update", json=update_payload,
                           headers=_auth(login_token))
        assert upd.status_code == 200
        assert upd.json()["success"] is True

        # 6. Verify updates persisted (via fresh GET, not cache)
        from cache import cache
        cache.delete(f"members:get:{mid}")

        verify = client.post("/members/get", json={"member_id": mid})
        assert verify.status_code == 200
        vdata = verify.json()["data"]
        assert vdata["headline"] == "Senior Engineer"
        assert vdata["about"] == "Building the future."
        assert vdata["phone"] == "+1-555-0001"
        assert vdata["location_city"] == "San Jose"
        assert vdata["location_country"] == "USA"
        assert vdata["resume_text"] == "5 years of backend engineering experience."
        assert vdata["profile_photo_url"] == "https://example.com/avatar.jpg"

        # Verify structured fields
        exp = vdata["experience"]
        if isinstance(exp, str):
            import json
            exp = json.loads(exp)
        assert len(exp) == 2
        assert exp[0]["company"] == "StartupCo"

        edu = vdata["education"]
        if isinstance(edu, str):
            import json
            edu = json.loads(edu)
        assert len(edu) == 1
        assert edu[0]["school"] == "SJSU"

        skills = vdata["skills"]
        if isinstance(skills, str):
            import json
            skills = json.loads(skills)
        assert "Kafka" in skills

        # 7. Delete profile
        delete = client.post("/members/delete", json={"member_id": mid},
                              headers=_auth(login_token))
        assert delete.status_code == 200
        assert delete.json()["success"] is True

        # 8. Verify deletion
        gone = client.post("/members/get", json={"member_id": mid})
        assert gone.status_code == 200
        assert gone.json()["success"] is False


# ═══════════════════════════════════════════════════════════════════════════════
# 6. DASHBOARD
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.integration
class TestMemberDashboard:
    """Member dashboard payload shape and metrics."""

    def test_dashboard_payload_shape(self, client):
        reg = _register_member(client)
        token, mid = reg["access_token"], reg["user_id"]

        r = client.post("/analytics/member/dashboard", json={
            "member_id": mid,
        }, headers=_auth(token))
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is True

        data = body["data"]
        # Required fields
        assert "member_id" in data
        assert "name" in data
        assert "total_connections" in data
        assert "profile_views_30d" in data
        assert "total_views_30d" in data
        assert "application_status_breakdown" in data
        assert "total_applications" in data

        # Types
        assert isinstance(data["profile_views_30d"], list)
        assert isinstance(data["application_status_breakdown"], dict)
        assert isinstance(data["total_connections"], int)
        assert isinstance(data["total_views_30d"], int)
        assert isinstance(data["total_applications"], int)

    def test_dashboard_profile_views_entry_shape(self, client):
        """Each profile view entry should have 'date' and 'views' keys."""
        reg = _register_member(client)
        token, mid = reg["access_token"], reg["user_id"]

        # Inject a profile view record for this member
        from database import SessionLocal
        from models.member import ProfileViewDaily
        from datetime import date
        db = SessionLocal()
        try:
            pv = ProfileViewDaily(
                member_id=mid,
                view_date=date.today(),
                view_count=5,
            )
            db.add(pv)
            db.commit()
        finally:
            db.close()

        r = client.post("/analytics/member/dashboard", json={
            "member_id": mid,
        }, headers=_auth(token))
        assert r.status_code == 200
        views = r.json()["data"]["profile_views_30d"]
        assert len(views) >= 1
        entry = views[0]
        assert "date" in entry
        assert "views" in entry
        assert isinstance(entry["views"], int)

    def test_dashboard_application_status_values(self, client):
        """Status breakdown values should be non-negative integers."""
        reg = _register_member(client)
        token, mid = reg["access_token"], reg["user_id"]

        r = client.post("/analytics/member/dashboard", json={
            "member_id": mid,
        }, headers=_auth(token))
        assert r.status_code == 200
        breakdown = r.json()["data"]["application_status_breakdown"]
        for status, count in breakdown.items():
            assert isinstance(status, str)
            assert isinstance(count, int)
            assert count >= 0

    def test_dashboard_new_member_zero_metrics(self, client):
        """A freshly registered member should have zero totals."""
        reg = _register_member(client)
        token, mid = reg["access_token"], reg["user_id"]

        r = client.post("/analytics/member/dashboard", json={
            "member_id": mid,
        }, headers=_auth(token))
        assert r.status_code == 200
        data = r.json()["data"]
        assert data["total_applications"] == 0
        assert data["total_connections"] == 0
        # Views may or may not have data depending on profile.viewed events

    def test_dashboard_forbidden_for_other_member(self, client):
        reg = _register_member(client)
        token = reg["access_token"]

        r = client.post("/analytics/member/dashboard", json={
            "member_id": 999999,
        }, headers=_auth(token))
        assert r.status_code == 200
        assert r.json()["success"] is False

    def test_dashboard_forbidden_for_recruiter(self, client):
        rec = client.post("/auth/register/recruiter", json={
            "email": _unique_email("recruiter"),
            "password": "testpass123",
            "first_name": "Dash",
            "last_name": "Rec",
        })
        assert rec.status_code == 201
        rec_token = rec.json()["access_token"]

        r = client.post("/analytics/member/dashboard", json={
            "member_id": 1,
        }, headers=_auth(rec_token))
        assert r.status_code == 403
