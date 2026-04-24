# Auth Implementation Report

## Tables Added

### `user_credentials` (new)
| Column        | Type                        | Notes                                |
|---------------|-----------------------------|--------------------------------------|
| id            | INT PK AUTO_INCREMENT       |                                      |
| user_type     | ENUM('member','recruiter')  |                                      |
| user_id       | INT                         | Points to member_id or recruiter_id  |
| email         | VARCHAR(255) UNIQUE         | Must match the profile table email   |
| password_hash | VARCHAR(255)                | bcrypt via passlib                   |
| created_at    | TIMESTAMP                   | server default NOW()                 |

No existing tables were modified.

---

## Endpoints Added

| Method | Path                      | Auth required | Description                              |
|--------|---------------------------|---------------|------------------------------------------|
| POST   | /auth/register/member     | none          | Create member profile + credentials; returns JWT |
| POST   | /auth/register/recruiter  | none          | Create recruiter profile + credentials; returns JWT |
| POST   | /auth/login               | none          | Email + password → JWT bearer token      |
| POST   | /auth/login-form          | none          | OAuth2 form-data login (Swagger Authorize button) |
| GET    | /auth/me                  | Bearer token  | Return current user info + profile       |

---

## Protected Routes (after this implementation)

### Members only (`require_member` dependency)
| Method | Path                    | Ownership check                                      |
|--------|-------------------------|------------------------------------------------------|
| POST   | /applications/submit    | `req.member_id` must equal token `user_id`           |
| POST   | /jobs/save              | `req.member_id` must equal token `user_id`           |
| POST   | /members/update         | `req.member_id` must equal token `user_id`           |
| POST   | /members/delete         | `req.member_id` must equal token `user_id`           |
| POST   | /connections/request    | `req.requester_id` must equal token `user_id`        |
| POST   | /connections/accept     | `conn.receiver_id` must equal token `user_id`        |
| POST   | /connections/reject     | `conn.receiver_id` must equal token `user_id`        |

### Recruiters only (`require_recruiter` dependency)
| Method | Path                        | Ownership check                                      |
|--------|-----------------------------|------------------------------------------------------|
| POST   | /jobs/create                | `req.recruiter_id` must equal token `user_id`        |
| POST   | /jobs/update                | `job.recruiter_id` must equal token `user_id`        |
| POST   | /jobs/close                 | `job.recruiter_id` must equal token `user_id`        |
| POST   | /applications/byJob         | `job.recruiter_id` must equal token `user_id`        |
| POST   | /applications/updateStatus  | `job.recruiter_id` must equal token `user_id`        |
| POST   | /applications/addNote       | `job.recruiter_id` must equal token `user_id`        |
| POST   | /recruiters/update          | `req.recruiter_id` must equal token `user_id`        |
| POST   | /recruiters/delete          | `req.recruiter_id` must equal token `user_id`        |

### Any authenticated user
| Method | Path              | Notes                              |
|--------|-------------------|------------------------------------|
| POST   | /messages/send    | sender_id must equal token user_id |
| POST   | /threads/open     | any logged-in user                 |
| GET    | /auth/me          | any valid token                    |

### Public (no auth)
- `GET /health`
- `POST /jobs/get`, `/jobs/search`, `/jobs/byRecruiter`
- `POST /members/get`, `/members/search`, `/members/create`*
- `POST /recruiters/get`, `/recruiters/create`*
- `POST /applications/get`, `/applications/byMember`
- `POST /threads/get`, `/threads/byUser`, `/messages/list`
- All `/events/*`, `/analytics/*` endpoints
- All `/ai/*` endpoints

*`/members/create` and `/recruiters/create` are legacy seed/admin endpoints.
The proper way to create accounts is `/auth/register/member` or `/auth/register/recruiter`.

---

## Config Vars

Set these in your `.env` file (or environment):

```
JWT_SECRET_KEY=your-strong-secret-here        # required in production
JWT_ALGORITHM=HS256                            # default: HS256
JWT_EXPIRE_MINUTES=1440                        # default: 1440 (24 hours)
```

---

## How to Run Schema Migrations

The `user_credentials` table is created automatically at startup via SQLAlchemy's `create_all()`. No manual migration is needed.

To verify the table was created:
```bash
# Connect to MySQL
docker exec -it linkedin-mysql-1 mysql -u linkedin_user -plinkedin_pass linkedin
SHOW TABLES;
DESCRIBE user_credentials;
```

---

## Testing via Swagger UI

1. Start the backend: `cd backend && uvicorn main:app --reload`
2. Open `http://localhost:8000/docs`
3. Register: **POST /auth/register/member** → copy `access_token`
4. Click **Authorize** (top right) → paste token → **Authorize**
5. All protected endpoints now send `Authorization: Bearer <token>`

---

## 5 curl Examples

### 1. Register a member
```bash
curl -s -X POST http://localhost:8000/auth/register/member \
  -H "Content-Type: application/json" \
  -d '{
    "email": "jane@example.com",
    "password": "secret123",
    "first_name": "Jane",
    "last_name": "Smith",
    "headline": "ML Engineer"
  }' | python3 -m json.tool
```

### 2. Register a recruiter
```bash
curl -s -X POST http://localhost:8000/auth/register/recruiter \
  -H "Content-Type: application/json" \
  -d '{
    "email": "bob@acme.com",
    "password": "secret123",
    "first_name": "Bob",
    "last_name": "Hiring",
    "company_name": "Acme Corp",
    "company_industry": "Technology"
  }' | python3 -m json.tool
```

### 3. Login
```bash
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "jane@example.com", "password": "secret123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

echo "Token: $TOKEN"
```

### 4. Call a protected member endpoint (submit application)
```bash
# First get your member_id from /auth/me, then:
curl -s -X POST http://localhost:8000/applications/submit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "job_id": 1,
    "member_id": 1,
    "cover_letter": "I am excited to apply!"
  }' | python3 -m json.tool
```

### 5. Call a protected recruiter endpoint (list applications for a job)
```bash
# Login as recruiter first to get RECRUITER_TOKEN, then:
curl -s -X POST http://localhost:8000/applications/byJob \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RECRUITER_TOKEN" \
  -d '{"job_id": 1, "page": 1, "page_size": 20}' \
  | python3 -m json.tool
```

---

## Frontend Auth Flow

1. User opens **Account** tab → sees login / register-member / register-recruiter forms
2. On successful login or register → JWT stored in `localStorage["linkedin_auth_token"]`
3. All subsequent API calls include `Authorization: Bearer <token>` automatically
4. **Role-based navigation** activates immediately:
   - **Guest:** Overview, Jobs, Members, Account
   - **Member:** Overview, Jobs, Members, Messages, Connections, Account
   - **Recruiter:** Overview, Jobs, Analytics, Messages, AI Recruiter, Account
5. A role badge ("member" or "recruiter") appears in the nav bar
6. **Job Apply form** auto-fills Member ID from the token (read-only for logged-in members)
7. On logout → token cleared, nav resets to guest tabs

---

## Files Changed

### Backend
| File | Change |
|------|--------|
| `backend/config.py` | Added `JWT_SECRET_KEY`, `JWT_ALGORITHM`, `JWT_EXPIRE_MINUTES` env var support |
| `backend/auth.py` | Use `settings.JWT_ALGORITHM` and `settings.JWT_EXPIRE_MINUTES` |
| `backend/routers/jobs.py` | Protected `update_job` with `require_recruiter` + ownership check |
| `backend/routers/applications.py` | Protected `byJob`, `updateStatus`, `addNote` with `require_recruiter` + job ownership check |
| `backend/routers/recruiters.py` | Protected `update_recruiter`, `delete_recruiter` with `require_recruiter` + ownership check |
| `backend/routers/messages.py` | Protected `open_thread` with `get_current_user` |

### Frontend
| File | Change |
|------|--------|
| `frontend/src/api.ts` | Added `parseStoredUser()` — decode JWT payload from localStorage without network call |
| `frontend/src/App.tsx` | Role-based tab navigation; `onAuthChange` wired to `AuthPanel`; role badge in nav |
| `frontend/src/components/AuthPanel.tsx` | Added `onAuthChange` prop; restores user info from token on page load |
| `frontend/src/components/JobApplyForm.tsx` | Auto-fills Member ID from token for logged-in members |
| `frontend/src/App.css` | Added `.nav-role-badge` styles |

### New Files
| File | Description |
|------|-------------|
| `AUTH_IMPLEMENTATION_REPORT.md` | This document |
