# LinkedIn Agentic AI — 8-Way Task Split

> Derived from `Class_Project_Description_LinkedIn_AgenticAI.docx`.
> Every spec section (3-tier architecture, services, Kafka, AI agents,
> analytics, performance, deployment, test class, writeup) has an owner.
> Each teammate owns a vertical slice (UI + service + model) so
> collisions are minimized.  PR boundaries are listed for each owner.

## Global rules of the road
- One owner per file listed in **"Owned paths"**; everyone else opens a PR
  and requests a review from that owner.
- Shared files (`App.tsx`, `App.css`, `docker-compose.yml`, `main.py`,
  `database.py`, `kafka_producer.py`, `cache.py`, `auth.py`) → small
  targeted diffs only, reviewed by **Teammate 8** (DevOps) before merge.
- All new endpoints must follow the `/{domain}/{verb}` POST-only pattern
  and be added to `API_DESIGN_DOCUMENT.md`.
- All new Kafka events must follow the envelope
  `{event_id, event_type, trace_id, occurred_at, version, source, payload}`.
- Definition of Done (per the spec): endpoint works + event emitted +
  stored + visible in analytics + test case + docstring.

---

## Teammate 1 — Member / Profile Service + Auth

- **Module (spec §4.1, §5.1, §6 Profile Service):** member profiles, sign-up
  / sign-in, profile edit & photo upload, member-facing dashboard.
- **Owned paths:**
  - `backend/routers/members.py`, `backend/routers/auth_router.py`
  - `backend/models/member.py`, `backend/models/user_credentials.py`
  - `backend/schemas/member.py`, `backend/schemas/auth.py`
  - `frontend/src/components/ProfilePage.tsx`,
    `frontend/src/components/AuthPanel.tsx`,
    `frontend/src/components/MemberDashboard.tsx`
- **Completed as of now:**
  - JWT-based register / login for both member & recruiter.
  - `/members/get`, `/members/update`, `/members/search`, `/members/delete`
    + `/auth/register/*`, `/auth/login`, `/auth/me` all live.
  - Profile page with photo upload (resized + base64 data URL) working
    end-to-end; `profile_photo_url` widened to `MEDIUMTEXT`.
  - Insecure `/members/create` endpoint **removed** (security fix).
- **Need to improvise:**
  - Structured `experience` and `education` blocks (spec §4.1 — required
    fields, currently flat `about`/`resume_text` only).
  - Member search UI with filter chips (skill, location, keyword) —
    endpoint exists, UI uses it weakly.
  - `profile_views` daily counter (spec §4.1) — column exists but isn't
    incremented; wire to an `events/ingest` call from the members UI.
  - "Who viewed your profile" list for the member dashboard.
  - Password reset & change-password flow.
  - Duplicate-email failure path (spec §12) — currently returns 409 from
    backend; needs a friendly banner in `AuthPanel`.
- **Responsibilities:**
  - Own **Flow #1 (profile create → edit → view → delete)** for the
    week-5 demo.
  - Keep the member schema in sync with the seed loader used by T7.
  - Unit + integration tests under `backend/tests/test_members_*.py`.
- **Nice-to-haves:**
  - LinkedIn-style "skills assessment" badges (mock).
  - Resume upload as real PDF → send to T5's resume-parser service.

---

## Teammate 2 — Jobs + Applications Service

- **Module (spec §4.3, §4.4, §5.1 apply, §5.2 recruiter, §6 Job &
  Application Service):** job CRUD, search / filter, job detail,
  member apply, recruiter applicant review.
- **Owned paths:**
  - `backend/routers/jobs.py`, `backend/routers/applications.py`,
    `backend/routers/recruiters.py`
  - `backend/models/job.py`, `backend/models/application.py`,
    `backend/models/recruiter.py`
  - `backend/schemas/job.py`, `backend/schemas/application.py`,
    `backend/schemas/recruiter.py`
  - `frontend/src/components/JobDetailPanel.tsx`,
    `frontend/src/components/JobApplyForm.tsx`
  - (tabs `jobs`, `members` in `App.tsx` — coordinate with T1)
- **Completed as of now:**
  - `/jobs/{create,get,update,search,close,byRecruiter}` and
    `/applications/{submit,get,byJob,byMember,updateStatus,addNote}` all
    implemented and accept JWT where required.
  - Recruiter can create jobs; member can apply.
  - `/recruiters/create` removed; recruiter sign-up via `/auth/register/recruiter`.
- **Need to improvise:**
  - **Apply-to-closed-job** failure handling (spec §12) — must return a
    proper 409 + UI banner.
  - **Duplicate application** guard (spec §12) — add unique index on
    `(job_id, member_id)` and friendly error.
  - Recruiter "Applicants inbox" UI — list applications for a job, open
    resume, mark as interview / offer / reject.
  - Job detail page polish (LinkedIn-style — company header, "Easy Apply"
    button, skills chips, salary range).
  - `views_count` + `applicants_count` counters: increment on job.view
    and application.submit; surface in recruiter dashboard.
  - Save-job feature + `job.saved` Kafka event (needed by T6 analytics).
- **Responsibilities:**
  - Own **Flow #2 (search → view → apply → recruiter status update)**
    for the week-5 demo.
  - Emit `job.viewed`, `job.saved`, `application.submitted`,
    `application.statusChanged` events via `kafka_producer.publish()`.
  - Coordinate with T7 on caching `jobs/search` results in Redis.
- **Nice-to-haves:**
  - "Similar jobs" widget (calls T5's job–candidate matcher in reverse).
  - CSV export of applicants for a recruiter.

---

## Teammate 3 — Messaging + Connections (social graph)

- **Module (spec §4.5, §5 messaging, §6 Messaging & Connection Service):**
  1-to-1 messaging threads, connection requests, network graph.
- **Owned paths:**
  - `backend/routers/messages.py`, `backend/routers/connections.py`
  - `backend/models/message.py`, `backend/models/connection.py`
  - `backend/schemas/message.py`, `backend/schemas/connection.py`
  - `frontend/src/components/MessagingPanel.tsx`,
    `frontend/src/components/ConnectionsPanel.tsx`
- **Completed as of now:**
  - `/threads/{open,get,byUser}` and `/messages/{send,list}` live.
  - `/connections/{request,accept,reject,list,mutual}` live.
  - Connection + messaging panels render, send messages, render threads.
- **Need to improvise:**
  - **Real-time delivery.** Wire `message.sent` Kafka event → a
    server-sent-events or WebSocket channel → live update in
    `MessagingPanel` without a refresh (spec §6 "at least one async
    workflow" — this is a good candidate besides the AI one).
  - **Idempotent retry** on `/messages/send` using a client-generated
    `message_client_id` header (spec §12 "message send failure + retry").
  - Inbox unread counter → surface in the top-nav Messaging icon.
  - Pending-connection-requests inbox (currently buried). Already
    surfaced through T4's notifications — coordinate on the Accept /
    Reject buttons.
  - **Mutual-connections** UI (spec §6 extra credit) — endpoint exists.
  - Network-growth chart (count over time) for the member dashboard.
- **Responsibilities:**
  - Own **Flow #3 (send connection request → accept → message)** for
    the week-5 demo.
  - Kafka events: `message.sent`, `connection.requested`,
    `connection.accepted`, `connection.rejected`.
  - Tests for send-failure + retry and idempotency.
- **Nice-to-haves:**
  - Typing indicator via WebSocket.
  - Group / team threads (>2 participants).

---

## Teammate 4 — Feed, Posts & Notifications (new module)

- **Module (adds LinkedIn-home parity — not explicitly in spec but
  directly supports §5.1 "View analytics / activity" and the
  presentation's "GUI resembles interactions" 5%):**
  feed posts, post composer with image, post likes, notifications bell.
- **Owned paths:**
  - `backend/routers/posts.py`, `backend/routers/notifications.py`
  - `backend/models/post.py`, `backend/schemas/post.py`
  - `frontend/src/components/HomeFeed.tsx`,
    `frontend/src/components/PostComposer.tsx`,
    `frontend/src/components/PostCard.tsx`,
    `frontend/src/components/NotificationsPanel.tsx`
- **Completed as of now:**
  - `posts` + `post_likes` tables auto-created.
  - `/posts/{create,feed,like,delete}` endpoints — authenticated,
    author-only delete, idempotent like toggle.
  - `/notifications/list` aggregates: pending connection requests
    (actionable, drives the unread badge), post likes, posts from
    accepted connections.
  - 3-column LinkedIn home: left profile rail + composer + feed + right
    news/puzzles rail; top-nav bell with badge + uploaded photo avatar.
- **Need to improvise:**
  - **Comments** on posts (only likes + share stub today).
  - Emit `post.created` Kafka event + worker that fans it out to the
    author's connections' notification inboxes (spec-aligned async
    workflow).
  - **Mark-as-read** state for notifications (add a table
    `notification_reads` so the badge clears correctly).
  - Pagination / infinite scroll on the feed (currently 20-post cap).
  - Right-rail news content from a live feed or cached MongoDB
    collection instead of the hard-coded list.
- **Responsibilities:**
  - Own the **home screen UX** and the **notifications bell UX**.
  - Coordinate with T3 so connection-request notifications open the
    Connections tab with the right item focused.
  - Tests under `backend/tests/test_posts_*.py`.
- **Nice-to-haves:**
  - Video upload (composer stub is there).
  - "People you may know" rail powered by T5's matcher.

---

## Teammate 5 — Agentic AI Service (FastAPI + agents + WS)

- **Module (spec §7 — 15 % of grade):** multi-agent recruiter copilot.
- **Owned paths:**
  - `backend/routers/ai_service.py`
  - `backend/agents/hiring_assistant.py`,
    `backend/agents/resume_parser.py`,
    `backend/agents/job_matcher.py`,
    `backend/agents/outreach_generator.py`
  - `backend/scripts/ai_evaluation.py`
  - `frontend/src/components/AiDashboard.tsx`
- **Completed as of now:**
  - FastAPI endpoints for request + status (spec §7.4 bullet 1).
  - 4 agents exist: supervisor (hiring assistant), resume parser,
    job–candidate matcher, outreach generator.
  - Task trace rehydration on startup (`rehydrate_tasks`).
  - Kafka `ai.requests` / `ai.results` topics referenced.
- **Need to improvise:**
  - **WebSocket streaming** of step events to the UI (spec §7.4 bullet
    3). Today the UI polls — switch to `/ws/ai/{trace_id}`.
  - **Human-in-the-loop approval** (spec §7.4 bullet 5 — required).
    Recruiter sees draft outreach message, clicks **Approve / Edit /
    Reject** — persist the decision + which fraction of drafts were
    approved as-is (reporting metric in spec §7.3).
  - **Multi-step pipeline trace**: one `trace_id` threaded through
    resume-parse → match → outreach with step-level results stored in
    MongoDB (spec §7.4 bullet 6 "persist task traces").
  - Wire **Career Coach agent** (optional but encouraged, spec §7.1).
  - Publish at least two **evaluation metrics** (spec §7.3):
    - Top-k skills overlap rubric.
    - HITL approval rate (% approved as-is vs edited vs rejected).
  - Idempotency on `ai.requests` consumer (spec §12).
- **Responsibilities:**
  - Own the AI demo flow end-to-end and the agent architecture diagram
    slide for the presentation.
  - Coordinate with T7 on Kafka consumer groups for AI workers.
- **Nice-to-haves:**
  - Swap Ollama → a hosted OpenAI-compatible endpoint via config.
  - Replay UI: click a trace to step through past runs.

---

## Teammate 6 — Analytics, Logging & Dashboards

- **Module (spec §6 Analytics/Logging Service, §8 Data Analytics,
  grading §10 "web/user/item tracking"):** event ingestion, recruiter
  dashboard graphs, member dashboard graphs, tracking policy.
- **Owned paths:**
  - `backend/routers/analytics.py`
  - `frontend/src/components/TopJobsChart.tsx`,
    `FunnelChart.tsx`, `GeoTable.tsx`, `GeoMonthlyChart.tsx`,
    `SavesTrendChart.tsx`, `RecruiterJobCharts.tsx` (Top/Least/Clicks),
    `ActivityFeed.tsx`
- **Completed as of now:**
  - `/events/ingest`, `/analytics/jobs/top`, `/analytics/funnel`,
    `/analytics/geo`, `/analytics/member/dashboard` scaffolded.
  - Recharts-based visualizations already in the bundle.
- **Need to improvise:**
  - Connect all five **required recruiter charts** (spec §8.1) to real
    event data in MongoDB, not placeholder payloads:
    1. Top 10 jobs by applications / month.
    2. City-wise applications / month for a selected job.
    3. Bottom 5 jobs by applications (low traction).
    4. Clicks per job (from `job.viewed` events).
    5. Saved jobs per day / week (from `job.saved` events).
  - Both **member dashboard** charts (spec §8.2):
    1. Profile views / day (last 30 days).
    2. Application status breakdown.
  - Write the **tracking policy write-up** (grading §10) — what's
    logged, why, retention, privacy.  Drop in `docs/ANALYTICS_POLICY.md`.
  - Add MongoDB indexes on `events.created_at` + `events.type`
    (document in the write-up).
- **Responsibilities:**
  - Guarantee every required chart has ≥ 10 k events worth of data on
    the demo box (coordinate with T7's seeder).
  - Feed analytics numbers into the member/recruiter dashboards on the
    home screen.
- **Nice-to-haves:**
  - "Who viewed my profile" heatmap by hour.
  - CSV / JSON export buttons on each chart.

---

## Teammate 7 — Performance, Caching, Kafka, Scalability

- **Module (spec §6.1 Kafka, §10 DB split, §11 perf + 10 k scale,
  grading §10 %, §11.1 bar charts):** Redis caching, Kafka topics +
  consumer groups + idempotency, load tests, scale target, perf charts.
- **Owned paths:**
  - `backend/cache.py`, `backend/cache_benchmark.py`
  - `backend/kafka_producer.py`, `backend/kafka_consumer.py`
  - `backend/seed_data.py`, `backend/scripts/load_kaggle_jobs.py`,
    `backend/scripts/load_kaggle_resumes.py`
  - `load_tests/*.py`, `load_tests/charts/*`
- **Completed as of now:**
  - Redis client wired; a couple of read paths cached.
  - Kafka producer + consumer scaffolding; envelope standard defined.
  - Locust + perf_comparison + chart generator scripts exist.
  - Seed script runs; Kaggle loaders exist.
- **Need to improvise:**
  - Cache the **hot read paths** (spec §11 "cache entity lookups"):
    `/jobs/get`, `/jobs/search`, `/members/get`, `/analytics/jobs/top`.
    Invalidate on write (coordinate with T1/T2 on invalidation keys).
  - Hit the **10 000 members / 10 000 jobs / 10 000 recruiters**
    target (spec §11 minimum scale) in the seeder and commit a
    one-command bulk-load script.
  - Drive the **four required bar charts** for the presentation
    (spec §11.1): B, B+S, B+S+K, B+S+K+Other at 100 concurrent threads.
    Deliver as `docs/PERF_REPORT.md` + PNGs in `load_tests/charts/`.
  - **Kafka consumer groups + idempotency** (spec §12). Add a
    `processed_events` table keyed by `event_id`.
  - **Transaction/rollback** on multi-step apply (DB write + Kafka
    publish must be consistent — outbox table pattern recommended).
- **Responsibilities:**
  - Own the **Scalability & Performance** presentation section.
  - Provide the 10 k-row seeded DB snapshot to the team.
- **Nice-to-haves:**
  - JMeter plan in `load_tests/jmeter/` (spec notes "You may use
    Apache JMeter").
  - Request-trace IDs surfaced in response headers.

---

## Teammate 8 — DevOps, Deployment, Testing, Documentation

- **Module (spec §2 deliverables, §11 Docker/AWS, grading §10 % tests +
  write-up, §Final presentation):** infra, CI, deploy, test class,
  failure-mode suite, write-up, presentation.
- **Owned paths:**
  - `docker-compose.yml`, `Dockerfile`s under
    `frontend/Dockerfile`, `backend/Dockerfile`, `frontend/nginx.conf`
  - `k8s/*.yaml`
  - `backend/tests/*.py`
  - `docs/*.md`, `SETUP_AND_RUNBOOK.md`, `README.md`,
    `API_DESIGN_DOCUMENT.md`
- **Completed as of now:**
  - Working docker-compose for 7 services (MySQL, Mongo, Redis, Kafka,
    Ollama, backend, frontend).
  - K8s manifests present under `k8s/`.
  - `test_api.py`, `test_authz.py`, `test_reliability.py` exist and
    exercise the auth-hardened flows (after the recent security fix).
- **Need to improvise:**
  - **Deploy to AWS** (spec grading §10 %): pick EKS or ECS, update
    `k8s/deploy.sh` or add a Terraform/CloudFormation stack, publish
    a reachable URL.
  - **CI pipeline** (XP §"CI from day 1"): GitHub Actions that lints,
    builds containers, runs pytest + `tsc`, on every PR.
  - **Failure-mode test class** (spec §12): one `pytest` module that
    covers every listed failure (duplicate email, duplicate
    application, apply-to-closed-job, message retry, Kafka consumer
    idempotency, multi-step rollback).
  - **Final 5-page write-up** (spec §12 turn-in):
    object-management policy, heavyweight-resource handling,
    DB-write / cache-invalidation policy, client screenshots, DB schema
    screenshot, lessons learned.
  - **Presentation deck**: group info, schema diagram, system
    architecture, agent architecture, 4-bar perf charts (from T7), AI
    metrics (from T5).
- **Responsibilities:**
  - Single reviewer for any PR that touches shared infra files.
  - Keeps `API_DESIGN_DOCUMENT.md` in sync — due 4/7, **already
    submitted** but updates from T1-T6 need to be folded in before the
    final demo.
- **Nice-to-haves:**
  - Request-level tracing with OpenTelemetry to Grafana.
  - Blue/green deploy script for the demo day.

---

## Spec coverage cross-check

| Spec section                                   | Owner(s)   |
| ---------------------------------------------- | ---------- |
| §4.1 Member / §5.1 Member module               | T1         |
| §4.2 Recruiter / §5.2 Recruiter module         | T2         |
| §4.3 Job Posting / §6 Job Service              | T2         |
| §4.4 Job Application / §6 Application Service  | T2         |
| §4.5 Messaging & Connections / §6              | T3         |
| §5 "view activity" / LinkedIn-home parity      | T4         |
| §6 Analytics Service / §8 dashboards / §10 %   | T6         |
| §6.1 Kafka topics + envelope                   | T7 (infra), domain owners emit events |
| §7 Agentic AI + §7.2 multi-agent + §7.3 eval   | T5         |
| §9 Datasets (jobs + resumes)                   | T7 (seed) + T5 (resume parse) |
| §10 DB split MySQL/Mongo                       | T7 + T6    |
| §11 Scale 10 k / §11.1 perf bar charts         | T7         |
| §12 Failure modes / rollbacks                  | T8 (suite) + domain owners (impl) |
| §12 Turn-in (writeup, screenshots, tests)      | T8         |
| Grading §10 % tracking-policy report           | T6         |
| Grading §15 % Agentic AI                       | T5         |
| Grading §10 % Distributed services + AWS       | T8 (deploy) + T7 (distribution) |
| Final presentation deck                        | T8 (lead), every owner contributes their slide |

---

## Suggested weekly rhythm (aligned with spec W3 → W6)

- **W3 (4/8–4/14)** — T1, T2, T3 finish MVP sync flows.  T8 locks CI.
- **W4 (4/15–4/21)** — T7 ships Kafka async workflow #1 (T2's
  `application.submitted`) and #2 (T5's AI pipeline).
- **W5 (4/22–4/27)** — T6 ships all required dashboards; T7 ships the
  4-bar perf chart + 10 k seed; T4 polishes home.
- **W6 (4/28–5/4)** — integration week: everybody stabilizes, T8
  produces the write-up + deck; T5 finalizes HITL metrics.
- **5/5** — demo + submit.
