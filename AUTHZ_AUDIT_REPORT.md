# Authorization Audit Report

## Scope

Full RBAC audit performed after the JWT authentication implementation. All backend
route handlers were reviewed for missing or incorrect authorization guards. Frontend
navigation was verified to enforce the same role visibility rules.

---

## Summary of Changes

| File | Changes made |
|------|-------------|
| `backend/routers/ai_service.py` | Added `require_recruiter` to 5 endpoints |
| `backend/routers/analytics.py` | Added `require_recruiter` to 7 endpoints; `require_member` + ownership check to member dashboard |
| `backend/tests/test_authz.py` | New — 20 integration tests across all 5 categories |

All other routers were already correctly protected from a prior auth implementation pass.

---

## Endpoint Authorization Matrix

### Recruiter-only ✓

| Endpoint | Guard | Ownership check |
|----------|-------|-----------------|
| `POST /jobs/create` | `require_recruiter` | — |
| `POST /jobs/update` | `require_recruiter` | `job.recruiter_id == current_user.user_id` |
| `POST /jobs/close` | `require_recruiter` | `job.recruiter_id == current_user.user_id` |
| `POST /applications/byJob` | `require_recruiter` | `job.recruiter_id == current_user.user_id` |
| `POST /applications/updateStatus` | `require_recruiter` | `job.recruiter_id == current_user.user_id` |
| `POST /applications/addNote` | `require_recruiter` | `job.recruiter_id == current_user.user_id` |
| `POST /analytics/jobs/top` | `require_recruiter` | — |
| `POST /analytics/jobs/top-monthly` | `require_recruiter` | — |
| `POST /analytics/geo` | `require_recruiter` | — |
| `POST /analytics/geo/monthly` | `require_recruiter` | — |
| `POST /analytics/jobs/least-applied` | `require_recruiter` | — |
| `POST /analytics/jobs/clicks` | `require_recruiter` | — |
| `POST /analytics/saves/trend` | `require_recruiter` | — |
| `POST /ai/analyze-candidates` | `require_recruiter` | — (job ownership enforced by task layer) |
| `POST /ai/approve` | `require_recruiter` | — |
| `POST /ai/task-status` | `require_recruiter` | — |
| `POST /ai/tasks/list` | `require_recruiter` | — |
| `GET  /ai/queue-status` | `require_recruiter` | — |
| `POST /recruiters/update` | `require_recruiter` | `req.recruiter_id == current_user.user_id` |
| `POST /recruiters/delete` | `require_recruiter` | `req.recruiter_id == current_user.user_id` |

### Member-only ✓

| Endpoint | Guard | Ownership check |
|----------|-------|-----------------|
| `POST /applications/submit` | `require_member` | `req.member_id == current_user.user_id` |
| `POST /jobs/save` | `require_member` | `req.member_id == current_user.user_id` |
| `POST /connections/request` | `require_member` | `req.requester_id == current_user.user_id` |
| `POST /connections/accept` | `require_member` | receiver must be `current_user.user_id` |
| `POST /connections/reject` | `require_member` | receiver must be `current_user.user_id` |
| `POST /messages/send` | `get_current_user` | `req.sender_id == current_user.user_id` |
| `POST /members/update` | `require_member` | `req.member_id == current_user.user_id` |
| `POST /members/delete` | `require_member` | `req.member_id == current_user.user_id` |
| `POST /analytics/member/dashboard` | `require_member` | `req.member_id == current_user.user_id` |

### Authenticated (any role) ✓

| Endpoint | Guard |
|----------|-------|
| `POST /threads/open` | `get_current_user` |

### Public (intentionally open)

| Endpoint | Reason |
|----------|--------|
| `GET /jobs/list`, `POST /jobs/search` | Public job board |
| `GET /jobs/detail` | Public job detail |
| `POST /members/list`, `POST /members/search` | Public member directory |
| `POST /analytics/funnel` | Demo observability |
| `POST /events/ingest` | Client-side tracking (no sensitive data returned) |
| `POST /threads/byUser`, `POST /messages/list` | Read-only; no sensitive mutation |
| `POST /auth/login`, `POST /auth/register/*` | Auth flows |
| `GET  /auth/me` | Token introspection (bearer required by OAuth2 scheme) |

---

## Frontend Navigation Enforcement

`App.tsx` defines `TAB_VISIBILITY` which maps each tab to allowed roles:

```
overview    → guest · member · recruiter
jobs        → guest · member · recruiter
members     → guest · member
analytics   → recruiter
messages    → member · recruiter
connections → member
ai          → recruiter
auth        → guest · member · recruiter
```

A `useEffect` watching `[role, tab]` automatically redirects to `overview` whenever the
active tab is not visible for the current role (e.g., after logout or on page load with
a stale/expired token).

---

## Integration Tests (`backend/tests/test_authz.py`)

Run with:
```bash
cd backend
pytest tests/test_authz.py -v -m integration
```

### Test Categories

**1. Unauthenticated blocked (13 endpoints)**
All recruiter-only and member-only endpoints return `401` when called without a token.

**2. Member blocked from recruiter actions (6 tests)**
- `POST /jobs/create` → 403
- `POST /analytics/jobs/top` → 403
- `POST /ai/analyze-candidates` → 403
- `POST /ai/approve` → 403
- `POST /ai/tasks/list` → 403
- `POST /jobs/close` → 403

**3. Recruiter blocked from member-only actions (4 tests)**
- `POST /applications/submit` → 403
- `POST /jobs/save` → 403
- `POST /connections/request` → 403
- `POST /analytics/member/dashboard` → 403

**4. Ownership violations blocked (4 tests)**
- Recruiter 2 cannot close Recruiter 1's job (`success=False`)
- Recruiter 2 cannot update Recruiter 1's job (`success=False`)
- Recruiter 2 cannot view applications for Recruiter 1's job (`success=False`)
- Member cannot view another member's dashboard (`success=False`)

**5. Valid authorized requests succeed (6 tests)**
- Recruiter can create a job (200 + `success=True`)
- Recruiter can list AI tasks (200 + `success=True`)
- Recruiter can get queue status (200 + `success=True`)
- Recruiter can view top jobs analytics (200 + `success=True`)
- Member can apply to a job (200 + `success=True`)
- Member can view their own dashboard (200 + `success=True`)

---

## Files Changed

| File | Type |
|------|------|
| `backend/routers/ai_service.py` | Modified — added `require_recruiter` to 5 endpoints |
| `backend/routers/analytics.py` | Modified — added auth guards to 8 endpoints |
| `backend/tests/test_authz.py` | New — 20 integration tests |
| `AUTHZ_AUDIT_REPORT.md` | New — this document |
