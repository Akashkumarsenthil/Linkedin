"""
LinkedIn Platform — Locust Load Test
Models realistic read-heavy LinkedIn traffic (95% reads / 5% writes).

Read/Write split
----------------
  ReadUser  (weight 19) — job search, job detail view, member profile view
  WriteUser (weight  1) — application submit with valid JWT authentication

Authentication
--------------
WriteUser.on_start() calls POST /auth/login using the dedicated performance-test
account seeded by seed_data.seed_perf_test_user().  The JWT is cached on the
user instance and reused for all subsequent write requests.

  Credentials (seeded by seed_data.py):
    email:    perf.tester@linkedin-perf.io
    password: perftest123

  Run seed first:
    cd backend && python seed_data.py [--quick] --yes

ID ranges
---------
Set MEMBER_ID_MAX / JOB_ID_MAX to match the seeded dataset:
  --quick seed : MEMBER_ID_MAX=60,   JOB_ID_MAX=50
  --full  seed : MEMBER_ID_MAX=10000, JOB_ID_MAX=10000

Usage
-----
  locust -f locustfile.py --host http://localhost:8000
  locust -f locustfile.py --host http://localhost:8000 --headless -u 100 -r 10 -t 60s
"""

import json
import random
from locust import HttpUser, task, between, events

# ── Dataset bounds — match your seed profile ──────────────────────────────────
# Change these to 60 / 50 if running against the --quick seed.
MEMBER_ID_MAX = 10_000
JOB_ID_MAX    = 10_000

# Perf-test account credentials (seeded by seed_data.py → seed_perf_test_user)
PERF_TEST_EMAIL    = "perf.tester@linkedin-perf.io"
PERF_TEST_PASSWORD = "perftest123"

JOB_KEYWORDS = [
    "engineer", "python", "data scientist", "product manager",
    "frontend", "backend", "devops", "remote", "senior", "machine learning",
]

WORK_MODES = ["remote", "hybrid", "onsite"]


class ReadUser(HttpUser):
    """
    Simulates a member browsing jobs and profiles.
    Covers Scenario A: job search + job detail view.
    Weight 19 → ~95% of all simulated users are readers.
    """
    weight = 19
    wait_time = between(0.5, 1.5)

    @task(6)
    def search_jobs(self):
        """Job search — primary cache-hit driver."""
        keyword = random.choice(JOB_KEYWORDS)
        self.client.post(
            "/jobs/search",
            json={
                "keyword": keyword,
                "page": 1,
                "page_size": 10,
                "work_mode": random.choice([None, *WORK_MODES]),
            },
            name="/jobs/search",
        )

    @task(3)
    def get_job(self):
        """Job detail view — exercises jobs:get:{id} cache key."""
        job_id = random.randint(1, JOB_ID_MAX)
        self.client.post(
            "/jobs/get",
            json={"job_id": job_id},
            name="/jobs/get",
        )

    @task(2)
    def search_members(self):
        """Member search — exercises members:search cache key."""
        self.client.post(
            "/members/search",
            json={"keyword": random.choice(JOB_KEYWORDS), "page": 1, "page_size": 10},
            name="/members/search",
        )

    @task(1)
    def get_member(self):
        """Member profile view — exercises members:get:{id} cache key."""
        member_id = random.randint(1, MEMBER_ID_MAX)
        self.client.post(
            "/members/get",
            json={"member_id": member_id},
            name="/members/get",
        )


class WriteUser(HttpUser):
    """
    Simulates a member submitting a job application.
    Covers Scenario B: DB write + Kafka event via /applications/submit.
    Weight 1 → ~5% of all simulated users are writers.

    on_start() logs in to obtain a JWT.  All requests include the
    Authorization header so the endpoint's require_member guard is satisfied.
    """
    weight = 1
    wait_time = between(2, 5)

    def on_start(self):
        """Log in once and cache the JWT for all subsequent write requests."""
        self.token = None
        self.member_id = None
        try:
            resp = self.client.post(
                "/auth/login",
                json={"email": PERF_TEST_EMAIL, "password": PERF_TEST_PASSWORD},
                name="/auth/login [on_start]",
            )
            if resp.status_code == 200:
                data = resp.json()
                self.token = data.get("access_token")
                self.member_id = data.get("user_id")
            else:
                print(
                    f"[WriteUser] Login failed ({resp.status_code}). "
                    "Run: cd backend && python seed_data.py --yes  to create the perf-test user."
                )
        except Exception as e:
            print(f"[WriteUser] Login error: {e}")

    @task(1)
    def submit_application(self):
        """Application submit — DB write + Kafka event (Scenario B)."""
        if not self.token or not self.member_id:
            return   # skip if login failed

        job_id = random.randint(1, JOB_ID_MAX)
        self.client.post(
            "/applications/submit",
            json={
                "member_id": self.member_id,
                "job_id": job_id,
                "cover_letter": "Performance test application — automated.",
            },
            headers={"Authorization": f"Bearer {self.token}"},
            name="/applications/submit",
        )


# ── Event hooks for reporting ─────────────────────────────────────────────────

@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    print("=" * 60)
    print("  LinkedIn Platform — Locust Load Test")
    print(f"  MEMBER_ID_MAX={MEMBER_ID_MAX}  JOB_ID_MAX={JOB_ID_MAX}")
    print(f"  ReadUser weight=19 (~95%)  WriteUser weight=1 (~5%)")
    print("=" * 60)

@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    stats = environment.stats.total
    print("\n" + "=" * 60)
    print("  Test Complete")
    print(f"  Requests:  {stats.num_requests:,}")
    print(f"  Failures:  {stats.num_failures:,}")
    print(f"  RPS:       {stats.current_rps:.1f}")
    print(f"  P50:       {stats.get_response_time_percentile(0.50):.1f} ms")
    print(f"  P95:       {stats.get_response_time_percentile(0.95):.1f} ms")
    print("=" * 60)
