# AUTH_IMPLEMENTATION_REPORT

## Overview

JWT + OAuth2 Password Bearer authentication has been added to the LinkedIn Agentic AI Platform.
Authentication is handled by a dedicated `user_credentials` table so no existing models were
modified. Eight high-risk endpoint groups are now protected with caller-identity enforcement.

---

## Backend Changes

### New files

| File | Purpose |
|---|---|
| `backend/auth.py` | Password hashing (bcrypt), JWT issuance/verification, `TokenPayload` carrier, FastAPI dependency helpers (`get_current_user`, `optional_current_user`, `require_member`, `require_recruiter`) |
| `backend/models/user_credentials.py` | SQLAlchemy model for the `user_credentials` table |
| `backend/schemas/auth.py` | Pydantic schemas: `LoginRequest`, `TokenResponse`, `RegisterMemberRequest`, `RegisterRecruiterRequest`, `MeResponse` |
| `backend/routers/auth_router.py` | Auth endpoints: login, login-form, register/member, register/recruiter, /me |

### Modified files

**`backend/config.py`**
- Added `JWT_SECRET` (env var `JWT_SECRET`, default `linkedin-demo-secret-change-in-prod`)
- Added `JWT_EXPIRE_HOURS = 24`

**`backend/main.py`**
- Imports: `auth_router`, `models.user_credentials`, `engine`, `Base`
- Lifespan startup: calls `Base.metadata.create_all(bind=engine, checkfirst=True)` to create `user_credentials` table on first run without migrations
- Router registration: `app.include_router(auth_router.router)`

**`backend/requirements.txt`**
- Added `PyJWT==2.9.0`
- Added `passlib[bcrypt]==1.7.4`

**`backend/db/init.sql`**
- Added `CREATE TABLE IF NOT EXISTS user_credentials` DDL for fresh deployments

---

## Auth Endpoints

| Method | Path | Auth required | Description |
|---|---|---|---|
| POST | `/auth/login` | No | JSON `{email, password}` → JWT |
| POST | `/auth/login-form` | No | Form-data (Swagger Authorize button) → JWT |
| POST | `/auth/register/member` | No | Create member + credentials → JWT |
| POST | `/auth/register/recruiter` | No | Create recruiter + credentials → JWT |
| GET | `/auth/me` | Yes | Returns user info + profile dict |

All token responses include `access_token`, `token_type`, `user_type`, `user_id`, `email`.

---

## Protected Endpoints

### Applications (`backend/routers/applications.py`)

| Endpoint | Guard | Enforcement |
|---|---|---|
| `POST /applications/submit` | `require_member` | `req.member_id` must equal `current_user.user_id` |

### Connections (`backend/routers/connections.py`)

| Endpoint | Guard | Enforcement |
|---|---|---|
| `POST /connections/request` | `require_member` | `req.requester_id` must equal `current_user.user_id` |
| `POST /connections/accept` | `require_member` | `conn.receiver_id` must equal `current_user.user_id` |
| `POST /connections/reject` | `require_member` | `conn.receiver_id` must equal `current_user.user_id` |

### Messages (`backend/routers/messages.py`)

| Endpoint | Guard | Enforcement |
|---|---|---|
| `POST /messages/send` | `get_current_user` | `req.sender_id` must equal `current_user.user_id` |

Message send accepts both members and recruiters, hence `get_current_user` rather than
`require_member`.

### Jobs (`backend/routers/jobs.py`)

| Endpoint | Guard | Enforcement |
|---|---|---|
| `POST /jobs/create` | `require_recruiter` | `req.recruiter_id` must equal `current_user.user_id` |
| `POST /jobs/close` | `require_recruiter` | `job.recruiter_id` must equal `current_user.user_id` |
| `POST /jobs/save` | `require_member` | `req.member_id` must equal `current_user.user_id` |

### Members (`backend/routers/members.py`)

| Endpoint | Guard | Enforcement |
|---|---|---|
| `POST /members/update` | `require_member` | `req.member_id` must equal `current_user.user_id` |
| `POST /members/delete` | `require_member` | `req.member_id` must equal `current_user.user_id` |

---

## JWT Design

```
Header:  { "alg": "HS256", "typ": "JWT" }
Payload: { "sub": "<email>", "user_id": <int>, "user_type": "member"|"recruiter", "exp": <unix_ts> }
```

- Algorithm: HS256
- Expiry: 24 hours from issuance
- Secret: `settings.JWT_SECRET` (override via `JWT_SECRET` env var in production)
- Library: PyJWT 2.9.0 (`jwt.encode` / `jwt.decode`)

---

## Dependency Chain

```
oauth2_required  (auto_error=True)
    └── get_current_user     → TokenPayload
            ├── require_member    → 403 if user_type != "member"
            └── require_recruiter → 403 if user_type != "recruiter"

oauth2_optional  (auto_error=False)
    └── optional_current_user → TokenPayload | None
```

---

## Frontend Changes

### `frontend/src/api.ts`
- Added `getStoredToken()`, `setStoredToken(token)`, `clearStoredToken()` backed by `localStorage`
- `apiGet` and `apiPost` now attach `Authorization: Bearer <token>` when a token is present
- Added `apiPostForm` helper for form-encoded requests (used by Swagger-compatible `/auth/login-form`)

### `frontend/src/components/AuthPanel.tsx` (new)
- Three-tab form: Login / Register (Member) / Register (Recruiter)
- On success: stores token in localStorage, shows user badge (type, email, ID)
- While logged in: shows "GET /auth/me" button to inspect the full profile, and "Log out" button
- Errors shown inline below the form

### `frontend/src/App.tsx`
- Added `'auth'` to the `Tab` union type
- Added "Auth" button to the nav bar
- Renders `<AuthPanel />` when the Auth tab is active

### `frontend/src/App.css`
- Added auth panel styles: `.auth-mode-tabs`, `.auth-tab`, `.auth-form`, `.auth-status-card`,
  `.auth-badge`, `.auth-actions-row`, `.auth-logout-btn`, `.auth-me-card`, etc.

---

## `user_credentials` Table

```sql
CREATE TABLE user_credentials (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    user_type     ENUM('member', 'recruiter') NOT NULL,
    user_id       INT NOT NULL,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_email (email)
);
```

`user_id` is a logical FK to either `members.member_id` or `recruiters.recruiter_id` depending on
`user_type`. A hard FK was intentionally omitted to keep the auth table decoupled from the profile
tables and to simplify account cleanup.

---

## Unprotected Endpoints (intentional)

Read-only and listing endpoints remain open to allow the demo console to work without a token:

- `GET /` and `GET /health`
- `POST /members/create`, `/members/get`, `/members/search`
- `POST /jobs/get`, `/jobs/search`, `/jobs/byRecruiter`
- `POST /applications/get`, `/applications/byJob`, `/applications/byMember`, `/applications/updateStatus`, `/applications/addNote`
- `POST /connections/list`, `/connections/mutual`
- `POST /threads/*`, `/messages/list`
- All analytics and AI endpoints

---

## Security Notes

1. `JWT_SECRET` must be changed from the default before any production deployment.
2. Passwords are hashed with bcrypt (cost factor 12, via passlib). Plaintext is never stored.
3. Email uniqueness is enforced at both the `user_credentials` level and the profile table level.
4. Token expiry is 24 hours; there is no refresh token mechanism in this demo implementation.
5. CORS is currently `allow_origins=["*"]` — restrict in production.
