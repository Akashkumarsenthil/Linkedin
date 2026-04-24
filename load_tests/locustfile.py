"""
LinkedIn Platform — Locust Load Test
=====================================
Tests three endpoint groups with a realistic read-heavy / write-light split:

  ReadUser  (weight 7) — member search + job search
  WriteUser (weight 3) — application submit (+ incidental reads)

Seed data assumptions
---------------------
Run `python seed_data.py --quick --yes` (60 members, 50 jobs) before a quick
smoke test, or `python seed_data.py --yes` for the full 10 k dataset.
IDs are sequential starting at 1; adjust MEMBER_ID_MAX / JOB_ID_MAX below if
your database has been partially wiped and auto-increment has advanced.

Usage
-----
  cd load_tests
  locust -f locustfile.py --host http://localhost:8000

Then open http://localhost:8089 and set:
  Number of users : 20
  Spawn rate      : 2
  Run time        : 60s (optional)

Headless (CI / scripted):
  locust -f locustfile.py --host http://localhost:8000 \
         --users 20 --spawn-rate 2 --run-time 60s --headless \
         --html results/report.html --csv results/summary
"""

import random
from locust import HttpUser, task, between, constant_throughput

# ── Seed data ID ranges ───────────────────────────────────────────────────────
# Change these to match the actual row count in your database.
MEMBER_ID_MAX = 60     # quick seed; use 10_000 for full seed
JOB_ID_MAX    = 50     # quick seed; use 10_000 for full seed

# ── Realistic search terms ────────────────────────────────────────────────────
MEMBER_KEYWORDS = ["engineer", "python", "data", "manager", "analyst", "developer",
                   "java", "cloud", "machine learning", "backend"]
JOB_KEYWORDS    = ["engineer", "python", "data scientist", "product manager",
                   "frontend", "backend", "devops", "remote", "senior", "analyst"]
LOCATIONS       = ["San Jose", "San Francisco", "New York", "Austin", "Seattle", ""]
WORK_MODES      = ["remote", "hybrid", "onsite", ""]
EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", ""]
SENIORITY_LEVELS = ["junior", "mid", "senior", "lead", ""]


class ReadUser(HttpUser):
    """
    Simulates a user browsing job listings and searching for profiles.
    Read operations dominate real-world traffic (70 % of virtual users).
    """
    weight = 7
    wait_time = between(0.5, 2.0)

    @task(4)
    def search_jobs(self):
        """Search job postings — hits Redis cache on repeated queries."""
        payload = {
            "keyword": random.choice(JOB_KEYWORDS),
            "location": random.choice(LOCATIONS),
            "work_mode": random.choice(WORK_MODES),
            "employment_type": random.choice(EMPLOYMENT_TYPES),
            "seniority_level": random.choice(SENIORITY_LEVELS),
            "page": random.randint(1, 3),
            "page_size": 10,
        }
        # Strip empty strings so the server treats them as unset filters
        payload = {k: v for k, v in payload.items() if v != ""}
        with self.client.post(
            "/jobs/search",
            json=payload,
            name="/jobs/search",
            catch_response=True,
        ) as response:
            if response.status_code != 200:
                response.failure(f"HTTP {response.status_code}")

    @task(3)
    def search_members(self):
        """Full-text member profile search — exercises MySQL LIKE queries."""
        payload = {
            "keyword": random.choice(MEMBER_KEYWORDS),
            "page": random.randint(1, 3),
            "page_size": 10,
        }
        with self.client.post(
            "/members/search",
            json=payload,
            name="/members/search",
            catch_response=True,
        ) as response:
            if response.status_code != 200:
                response.failure(f"HTTP {response.status_code}")

    @task(2)
    def get_job(self):
        """Fetch a single job by ID — warms and reads the Redis cache."""
        job_id = random.randint(1, JOB_ID_MAX)
        with self.client.post(
            "/jobs/get",
            json={"job_id": job_id},
            name="/jobs/get",
            catch_response=True,
        ) as response:
            if response.status_code != 200:
                response.failure(f"HTTP {response.status_code}")

    @task(1)
    def get_member(self):
        """Fetch a single member profile by ID — warms and reads the Redis cache."""
        member_id = random.randint(1, MEMBER_ID_MAX)
        with self.client.post(
            "/members/get",
            json={"member_id": member_id},
            name="/members/get",
            catch_response=True,
        ) as response:
            if response.status_code != 200:
                response.failure(f"HTTP {response.status_code}")


class WriteUser(HttpUser):
    """
    Simulates a job-seeker submitting applications.
    Write operations are the minority (30 % of virtual users) but are the most
    expensive — each triggers a MySQL INSERT + Kafka publish.

    Note: the application endpoint returns HTTP 200 even for duplicates
    (success:False in JSON). Locust counts these as non-failures because the
    server handled the request correctly. The duplicate path still exercises
    the full DB read path and is valid throughput load.
    """
    weight = 3
    wait_time = between(1.0, 4.0)

    @task(3)
    def submit_application(self):
        """Submit a job application — MySQL INSERT + Kafka publish."""
        payload = {
            "member_id": random.randint(1, MEMBER_ID_MAX),
            "job_id":    random.randint(1, JOB_ID_MAX),
            "cover_letter": "I am excited to apply for this position.",
        }
        with self.client.post(
            "/applications/submit",
            json=payload,
            name="/applications/submit",
            catch_response=True,
        ) as response:
            if response.status_code != 200:
                response.failure(f"HTTP {response.status_code}")

    @task(2)
    def search_jobs_before_applying(self):
        """A write user also browses jobs before applying."""
        with self.client.post(
            "/jobs/search",
            json={"keyword": random.choice(JOB_KEYWORDS), "page": 1, "page_size": 5},
            name="/jobs/search",
            catch_response=True,
        ) as response:
            if response.status_code != 200:
                response.failure(f"HTTP {response.status_code}")

    @task(1)
    def search_members(self):
        """Occasional member search (recruiter perspective mixed in)."""
        with self.client.post(
            "/members/search",
            json={"keyword": random.choice(MEMBER_KEYWORDS), "page": 1, "page_size": 5},
            name="/members/search",
            catch_response=True,
        ) as response:
            if response.status_code != 200:
                response.failure(f"HTTP {response.status_code}")
