"""
LinkedIn Platform — Synthetic Data Seeder
Generates 10,000+ records for members, recruiters, jobs, applications,
connections, messages, and analytics events.

CLI: python seed_data.py [--quick] [--yes]
  --quick   Small dataset for local smoke tests (under a minute).
  --yes     Skip confirmation when replacing existing data (CI / scripts).
"""

import sys
import argparse
import random
import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from faker import Faker
from tqdm import tqdm
from sqlalchemy import text

# Add parent dir to path for imports
sys.path.insert(0, ".")
from database import engine, SessionLocal
from models.member import Member, ProfileViewDaily
from models.recruiter import Recruiter
from models.job import JobPosting, SavedJob
from models.application import Application
from models.message import Thread, ThreadParticipant, Message
from models.connection import Connection

fake = Faker()
Faker.seed(42)
random.seed(42)


def _dt_between_days_ago(start_days: int) -> datetime:
    """Faker relative strings like '-1Y' are version-sensitive; use explicit windows."""
    end = datetime.now()
    return fake.date_time_between(start_date=end - timedelta(days=start_days), end_date=end)


def _date_between_days_ago(start_days: int):
    end = datetime.now().date()
    return fake.date_between(start_date=end - timedelta(days=start_days), end_date=end)


@dataclass(frozen=True)
class SeedProfile:
    """Row counts and ID ranges for one seeding run (must stay consistent)."""

    members: int
    recruiters: int
    jobs: int
    applications: int
    connections: int
    threads: int
    msg_per_thread: int
    saved_jobs: int
    profile_views: int
    batch_size: int = 500


PROFILE_FULL = SeedProfile(
    members=10_000,
    recruiters=10_000,
    jobs=10_000,
    applications=25_000,   # increased from 15k for richer analytics + Pareto skew
    connections=20_000,
    threads=2_000,
    msg_per_thread=3,
    saved_jobs=8_000,
    profile_views=30_000,
    batch_size=500,
)

# Performance-test credentials — seeded by seed_perf_test_user() so load tests can log in
PERF_TEST_EMAIL = "perf.tester@linkedin-perf.io"
PERF_TEST_PASSWORD = "perftest123"

# Admin credentials — user_type='admin'; can access all frontend tabs including Performance Dashboard
ADMIN_EMAIL    = "admin@linkedin-perf.io"
ADMIN_PASSWORD = "admin123"

# Pareto hot-job fraction: 5% of jobs get ~40% of all applications
HOT_JOB_COUNT_FRACTION = 0.05   # 500 "viral" jobs out of 10k
HOT_JOB_APP_FRACTION   = 0.40   # 40% of all applications land on those jobs

PROFILE_QUICK = SeedProfile(
    members=60,
    recruiters=6,
    jobs=50,
    applications=120,
    connections=150,
    threads=12,
    msg_per_thread=3,
    saved_jobs=40,
    profile_views=80,
    batch_size=100,
)

PROFILE_1K = SeedProfile(
    members=1_000,
    recruiters=100,
    jobs=500,
    applications=2_500,
    connections=2_000,
    threads=200,
    msg_per_thread=3,
    saved_jobs=800,
    profile_views=3_000,
    batch_size=500,
)


# ─── Constants ──────────────────────────────────────────────────

TECH_SKILLS = [
    "Python", "Java", "JavaScript", "TypeScript", "C++", "C#", "Go", "Rust", "Ruby",
    "SQL", "MySQL", "PostgreSQL", "MongoDB", "Redis", "Elasticsearch",
    "React", "Angular", "Vue.js", "Node.js", "Express", "Django", "Flask", "FastAPI",
    "Spring Boot", "Docker", "Kubernetes", "AWS", "Azure", "GCP",
    "Terraform", "Jenkins", "CI/CD", "Git", "Linux", "Kafka", "RabbitMQ",
    "Machine Learning", "Deep Learning", "NLP", "Computer Vision", "TensorFlow",
    "PyTorch", "Scikit-learn", "Pandas", "NumPy", "Spark", "Hadoop", "Airflow",
    "Data Engineering", "Data Science", "DevOps", "Microservices", "REST API",
    "GraphQL", "Agile", "Scrum", "Product Management",
]

JOB_TITLES = [
    "Software Engineer", "Senior Software Engineer", "Staff Software Engineer",
    "Frontend Developer", "Backend Developer", "Full-Stack Developer",
    "Data Scientist", "Data Engineer", "ML Engineer", "AI Research Scientist",
    "DevOps Engineer", "Cloud Architect", "Site Reliability Engineer",
    "Product Manager", "Engineering Manager", "Tech Lead",
    "QA Engineer", "Security Engineer", "Mobile Developer",
    "Solutions Architect", "Technical Program Manager",
]

INDUSTRIES = [
    "Technology", "Finance", "Healthcare", "E-commerce", "Education",
    "Media & Entertainment", "Automotive", "Telecommunications",
    "Consulting", "Cybersecurity", "Gaming", "Social Media",
]

COMPANIES = [
    "Google", "Meta", "Amazon", "Apple", "Microsoft", "Netflix", "Uber",
    "Airbnb", "Stripe", "Salesforce", "Twitter/X", "LinkedIn", "Adobe",
    "Nvidia", "Tesla", "SpaceX", "Palantir", "Databricks", "Snowflake",
    "Coinbase", "Robinhood", "DoorDash", "Instacart", "Figma",
    "TechCorp", "DataFlow Inc.", "CloudNine", "InnovateTech", "QuantumLeap",
    "NexGen Labs", "PixelWorks", "CodeCraft", "ByteStream", "LogicGate",
]

CITIES = [
    ("San Francisco", "California", "USA"),
    ("San Jose", "California", "USA"),
    ("New York", "New York", "USA"),
    ("Seattle", "Washington", "USA"),
    ("Austin", "Texas", "USA"),
    ("Chicago", "Illinois", "USA"),
    ("Denver", "Colorado", "USA"),
    ("Boston", "Massachusetts", "USA"),
    ("Los Angeles", "California", "USA"),
    ("Portland", "Oregon", "USA"),
    ("Atlanta", "Georgia", "USA"),
    ("Dallas", "Texas", "USA"),
    ("Miami", "Florida", "USA"),
    ("Toronto", "Ontario", "Canada"),
    ("Vancouver", "BC", "Canada"),
    ("London", "England", "UK"),
    ("Berlin", "Berlin", "Germany"),
    ("Bangalore", "Karnataka", "India"),
    ("Remote", "", ""),
]

SENIORITY = ["Entry-level", "Mid-level", "Senior", "Lead", "Director"]
EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract", "Internship"]
WORK_MODES = ["remote", "hybrid", "onsite"]
APP_STATUSES = ["submitted", "reviewing", "rejected", "interview", "offer"]

HEADLINE_TEMPLATES = [
    "{title} at {company}",
    "{title} | {skill1} | {skill2}",
    "Experienced {title} | Building scalable systems",
    "{title} passionate about {skill1} and {skill2}",
    "{title} | {company} | Open to new opportunities",
]

RESUME_TEMPLATES = [
    """Experienced {title} with {years}+ years in software development. Proficient in {skills}. 
Previously worked at {company1} and {company2}. {degree} from {school}.
Key achievements: Built and deployed {achievement}. Led team of {team_size} engineers.
Passionate about building scalable, high-performance systems.""",
    """{title} | {years} years experience
Skills: {skills}
Education: {degree} - {school}
Experience: {company1} ({years1} years), {company2} ({years2} years)
Built {achievement} serving {users} users. Expert in {skill1} and {skill2}.""",
]


def generate_resume_text(title, skills, years):
    """Generate a synthetic resume text."""
    template = random.choice(RESUME_TEMPLATES)
    skill_list = ", ".join(skills[:6])
    return template.format(
        title=title,
        years=years,
        skills=skill_list,
        company1=random.choice(COMPANIES),
        company2=random.choice(COMPANIES),
        degree=random.choice(["BS Computer Science", "MS Computer Science", "MS Data Science", "BS Engineering", "MBA"]),
        school=random.choice(["Stanford", "MIT", "CMU", "UC Berkeley", "Georgia Tech", "SJSU", "UCLA"]),
        achievement=random.choice(["microservices platform", "ML pipeline", "real-time data system", "mobile app", "API gateway"]),
        team_size=random.randint(3, 15),
        years1=random.randint(1, 4),
        years2=random.randint(1, 4),
        users=random.choice(["10K", "100K", "1M", "10M"]),
        skill1=skills[0] if skills else "Python",
        skill2=skills[1] if len(skills) > 1 else "AWS",
    )


def seed_members(db, profile: SeedProfile):
    """Seed member profiles."""
    count = profile.members
    print(f"\n📝 Seeding {count} members...")
    members = []
    # Pre-load existing emails to avoid duplicates on --append runs
    existing = {row[0] for row in db.execute(text("SELECT email FROM members")).fetchall()}
    used_emails = set(existing)

    for i in tqdm(range(count)):
        city, state, country = random.choice(CITIES)
        skills = random.sample(TECH_SKILLS, random.randint(3, 10))
        title = random.choice(JOB_TITLES)
        years = random.randint(0, 15)
        company = random.choice(COMPANIES)

        # Generate unique email (checked against DB + current batch)
        email = f"{fake.first_name().lower()}.{fake.last_name().lower()}{random.randint(1, 9999)}@{fake.free_email_domain()}"
        while email in used_emails:
            email = f"{fake.first_name().lower()}{random.randint(1, 9999999)}@{fake.free_email_domain()}"
        used_emails.add(email)

        headline_template = random.choice(HEADLINE_TEMPLATES)
        headline = headline_template.format(
            title=title, company=company, skill1=skills[0], skill2=skills[1]
        )

        member = Member(
            first_name=fake.first_name(),
            last_name=fake.last_name(),
            email=email,
            phone=fake.phone_number()[:20],
            location_city=city,
            location_state=state,
            location_country=country,
            headline=headline[:500],
            about=fake.paragraph(nb_sentences=4),
            experience=json.dumps([
                {"title": title, "company": company, "years": random.randint(1, 5)}
                for _ in range(random.randint(1, 4))
            ]),
            education=json.dumps([
                {
                    "degree": random.choice(["BS", "MS", "PhD", "MBA"]),
                    "field": random.choice(["Computer Science", "Data Science", "Engineering", "Business"]),
                    "school": random.choice(["Stanford", "MIT", "CMU", "SJSU", "UC Berkeley"]),
                    "year": random.randint(2010, 2024),
                }
            ]),
            skills=json.dumps(skills),
            resume_text=generate_resume_text(title, skills, years),
            connections_count=random.randint(0, 500),
            profile_views=random.randint(0, 1000),
        )
        members.append(member)

        if len(members) >= profile.batch_size:
            db.bulk_save_objects(members)
            db.commit()
            members = []

    if members:
        db.bulk_save_objects(members)
        db.commit()

    print(f"   ✓ {count} members created")


def seed_recruiters(db, profile: SeedProfile):
    """Seed recruiter accounts."""
    count = profile.recruiters
    print(f"\n👔 Seeding {count} recruiters...")
    recruiters = []
    existing = {row[0] for row in db.execute(text("SELECT email FROM recruiters")).fetchall()}
    used_emails = set(existing)

    for i in tqdm(range(count)):
        company = random.choice(COMPANIES)
        email = f"recruiter.{fake.last_name().lower()}{random.randint(1, 9999)}@{company.lower().replace(' ', '').replace('/', '')}.com"
        while email in used_emails:
            email = f"hr{random.randint(1, 9999999)}@{company.lower().replace(' ', '')}.com"
        used_emails.add(email)

        recruiter = Recruiter(
            company_id=random.randint(1, 50),
            first_name=fake.first_name(),
            last_name=fake.last_name(),
            email=email,
            phone=fake.phone_number()[:20],
            company_name=company,
            company_industry=random.choice(INDUSTRIES),
            company_size=random.choice(["1-50", "50-200", "200-1000", "1000-5000", "5000+"]),
            role=random.choice(["recruiter", "senior_recruiter", "talent_lead", "hr_manager"]),
            access_level=random.choice(["standard", "admin"]),
        )
        recruiters.append(recruiter)

    db.bulk_save_objects(recruiters)
    db.commit()
    print(f"   ✓ {count} recruiters created")


def seed_jobs(db, profile: SeedProfile):
    """Seed job postings."""
    count = profile.jobs
    print(f"\n💼 Seeding {count} job postings...")
    jobs = []
    n_rec = max(1, profile.recruiters)

    for i in tqdm(range(count)):
        city, state, country = random.choice(CITIES)
        skills = random.sample(TECH_SKILLS, random.randint(3, 8))
        location = f"{city}, {state}" if city != "Remote" else "Remote"

        job = JobPosting(
            company_id=random.randint(1, 50),
            recruiter_id=random.randint(1, n_rec),
            title=random.choice(JOB_TITLES),
            description=fake.paragraph(nb_sentences=6),
            seniority_level=random.choice(SENIORITY),
            employment_type=random.choice(EMPLOYMENT_TYPES),
            location=location,
            work_mode=random.choice(WORK_MODES),
            skills_required=json.dumps(skills),
            salary_min=random.choice([80000, 100000, 120000, 150000, 180000]),
            salary_max=random.choice([120000, 150000, 180000, 220000, 300000]),
            posted_datetime=_dt_between_days_ago(180),
            status=random.choice(["open"] * 8 + ["closed"] * 2),  # 80% open
            views_count=random.randint(10, 5000),
            applicants_count=0,  # Will be updated by applications
        )
        jobs.append(job)

        if len(jobs) >= profile.batch_size:
            db.bulk_save_objects(jobs)
            db.commit()
            jobs = []

    if jobs:
        db.bulk_save_objects(jobs)
        db.commit()

    print(f"   ✓ {count} jobs created")


def seed_applications(db, profile: SeedProfile):
    """Seed job applications with a Pareto (skewed) distribution.

    A small fraction of 'hot' jobs receive a disproportionate share of
    applications, mirroring real-world traffic patterns and making the
    caching benefit measurable: the same few jobs get hit repeatedly,
    so cached responses save many DB round-trips.
    """
    count = profile.applications
    n_mem = max(1, profile.members)
    n_job = max(1, profile.jobs)
    print(f"\n📋 Seeding {count} applications (Pareto distribution)...")
    apps = []
    used_combos = set()

    # Designate the first HOT_JOB_COUNT_FRACTION of jobs as "hot"
    hot_count = max(1, int(n_job * HOT_JOB_COUNT_FRACTION))
    hot_jobs = list(range(1, hot_count + 1))

    for i in tqdm(range(count)):
        member_id = random.randint(1, n_mem)

        # 40% of apps go to hot jobs, 60% distributed across all jobs
        if random.random() < HOT_JOB_APP_FRACTION:
            job_id = random.choice(hot_jobs)
        else:
            job_id = random.randint(1, n_job)

        combo = (member_id, job_id)
        if combo in used_combos:
            continue
        used_combos.add(combo)

        app = Application(
            job_id=job_id,
            member_id=member_id,
            resume_text=None,   # consumer will use member's resume_text
            cover_letter=fake.paragraph(nb_sentences=3) if random.random() > 0.3 else None,
            application_datetime=_dt_between_days_ago(90),
            status=random.choices(
                APP_STATUSES,
                weights=[30, 25, 20, 15, 10],
                k=1,
            )[0],
            recruiter_notes=fake.sentence() if random.random() > 0.7 else None,
        )
        apps.append(app)

        if len(apps) >= profile.batch_size:
            db.bulk_save_objects(apps)
            db.commit()
            apps = []

    if apps:
        db.bulk_save_objects(apps)
        db.commit()

    print(f"   ✓ {len(used_combos)} applications created  ({hot_count} hot jobs = top {int(HOT_JOB_COUNT_FRACTION*100)}%)")


def seed_connections(db, profile: SeedProfile):
    """Seed connections between members."""
    count = profile.connections
    n_mem = max(1, profile.members)
    print(f"\n🤝 Seeding {count} connections...")
    conns = []
    used_combos = set()

    for i in tqdm(range(count)):
        requester = random.randint(1, n_mem)
        receiver = random.randint(1, n_mem)

        if requester == receiver:
            continue

        combo = tuple(sorted([requester, receiver]))
        if combo in used_combos:
            continue
        used_combos.add(combo)

        status = random.choices(
            ["accepted", "pending", "rejected"],
            weights=[70, 20, 10],
            k=1,
        )[0]

        conn = Connection(
            requester_id=requester,
            receiver_id=receiver,
            status=status,
            created_at=_dt_between_days_ago(365),
        )
        conns.append(conn)

        if len(conns) >= profile.batch_size:
            db.bulk_save_objects(conns)
            db.commit()
            conns = []

    if conns:
        db.bulk_save_objects(conns)
        db.commit()

    print(f"   ✓ {len(used_combos)} connections created")


def seed_messages(db, profile: SeedProfile):
    """Seed messaging threads and messages."""
    thread_count = profile.threads
    msg_per_thread = profile.msg_per_thread
    n_mem = max(1, profile.members)
    n_rec = max(1, profile.recruiters)
    print(f"\n💬 Seeding {thread_count} threads with ~{msg_per_thread} messages each...")

    for i in tqdm(range(thread_count)):
        thread = Thread(subject=fake.sentence(nb_words=5))
        db.add(thread)
        db.flush()

        # Add 2 participants
        user1_id = random.randint(1, n_mem)
        user2_id = random.randint(1, n_rec)

        tp1 = ThreadParticipant(thread_id=thread.thread_id, user_id=user1_id, user_type="member")
        tp2 = ThreadParticipant(thread_id=thread.thread_id, user_id=user2_id, user_type="recruiter")
        db.add(tp1)
        db.add(tp2)

        # Add messages
        num_msgs = random.randint(1, msg_per_thread * 2)
        for j in range(num_msgs):
            sender_is_member = j % 2 == 0
            msg = Message(
                thread_id=thread.thread_id,
                sender_id=user1_id if sender_is_member else user2_id,
                sender_type="member" if sender_is_member else "recruiter",
                message_text=fake.paragraph(nb_sentences=random.randint(1, 3)),
                timestamp=_dt_between_days_ago(30),
            )
            db.add(msg)

        if i % max(1, thread_count // 20) == 0:
            db.commit()

    db.commit()
    print(f"   ✓ {thread_count} threads with messages created")


def seed_saved_jobs(db, profile: SeedProfile):
    """Seed saved jobs."""
    count = profile.saved_jobs
    n_mem = max(1, profile.members)
    n_job = max(1, profile.jobs)
    print(f"\n⭐ Seeding {count} saved jobs...")
    saved = []
    used_combos = set()

    for i in tqdm(range(count)):
        member_id = random.randint(1, n_mem)
        job_id = random.randint(1, n_job)

        combo = (member_id, job_id)
        if combo in used_combos:
            continue
        used_combos.add(combo)

        s = SavedJob(
            member_id=member_id,
            job_id=job_id,
            saved_at=_dt_between_days_ago(90),
        )
        saved.append(s)

        if len(saved) >= profile.batch_size:
            db.bulk_save_objects(saved)
            db.commit()
            saved = []

    if saved:
        db.bulk_save_objects(saved)
        db.commit()

    print(f"   ✓ {len(used_combos)} saved jobs created")


def seed_profile_views(db, profile: SeedProfile):
    """Seed daily profile views for analytics."""
    count = profile.profile_views
    n_mem = max(1, profile.members)
    print(f"\n👁️ Seeding {count} profile view records...")
    views = []
    used_combos = set()

    for i in tqdm(range(count)):
        member_id = random.randint(1, n_mem)
        view_date = _date_between_days_ago(30)

        combo = (member_id, str(view_date))
        if combo in used_combos:
            continue
        used_combos.add(combo)

        v = ProfileViewDaily(
            member_id=member_id,
            view_date=view_date,
            view_count=random.randint(1, 50),
        )
        views.append(v)

        if len(views) >= profile.batch_size:
            db.bulk_save_objects(views)
            db.commit()
            views = []

    if views:
        db.bulk_save_objects(views)
        db.commit()

    print(f"   ✓ {len(used_combos)} profile view records created")


def _clear_tables(db):
    print("🗑️  Clearing existing data...")
    for table in [
        "profile_views_daily", "saved_jobs", "messages",
        "thread_participants", "threads", "connections",
        "applications", "job_postings", "recruiters", "members",
    ]:
        db.execute(text(f"DELETE FROM {table}"))
        db.execute(text(f"ALTER TABLE {table} AUTO_INCREMENT = 1"))
    db.commit()
    print("   ✓ All tables cleared")


def seed_perf_test_user(db) -> int:
    """
    Seed a dedicated performance-test member + UserCredentials with known credentials.

    This user is used by the Locust and perf_comparison load tests so that
    Scenario B (application submit) can obtain a valid JWT without depending
    on any randomly generated seed email/password.

    Credentials:
        Email    : perf.tester@linkedin-perf.io
        Password : perftest123

    Returns the member_id of the created (or already-existing) user.
    """
    from models.user_credentials import UserCredentials
    from auth import hash_password

    existing_cred = db.query(UserCredentials).filter(
        UserCredentials.email == PERF_TEST_EMAIL
    ).first()
    if existing_cred:
        print(f"   ✓ Perf-test user already exists (member_id={existing_cred.user_id})")
        return existing_cred.user_id

    member = Member(
        first_name="Perf",
        last_name="Tester",
        email=PERF_TEST_EMAIL,
        headline="Performance test account — do not delete",
        location_city="San Francisco",
        location_state="California",
        location_country="USA",
        skills=json.dumps(["Python", "Load Testing"]),
        resume_text="Performance test user account.",
    )
    db.add(member)
    db.flush()  # get member_id

    cred = UserCredentials(
        user_type="member",
        user_id=member.member_id,
        email=PERF_TEST_EMAIL,
        password_hash=hash_password(PERF_TEST_PASSWORD),
    )
    db.add(cred)
    db.commit()
    print(f"   ✓ Perf-test user created  email={PERF_TEST_EMAIL}  member_id={member.member_id}")
    return member.member_id


def seed_admin_user(db) -> int:
    """
    Seed a dedicated admin account with user_type='admin'.

    The frontend grants admin users access to every tab, including the
    Performance Dashboard which is restricted to this role only.
    The backend auth router passes user_type through to the JWT verbatim,
    so no backend changes are needed — just seeding this credential.

    Credentials:
        Email    : admin@linkedin-perf.io
        Password : admin123

    Returns the member_id of the created (or already-existing) admin user.
    """
    from models.user_credentials import UserCredentials
    from auth import hash_password

    existing_cred = db.query(UserCredentials).filter(
        UserCredentials.email == ADMIN_EMAIL
    ).first()
    if existing_cred:
        print(f"   ✓ Admin user already exists (member_id={existing_cred.user_id})")
        return existing_cred.user_id

    member = Member(
        first_name="Platform",
        last_name="Admin",
        email=ADMIN_EMAIL,
        headline="Admin account — full access to all tabs",
        location_city="San Francisco",
        location_state="California",
        location_country="USA",
        skills=json.dumps(["Administration", "Performance"]),
        resume_text="Platform admin account.",
    )
    db.add(member)
    db.flush()  # get member_id

    cred = UserCredentials(
        user_type="admin",          # frontend reads this from the JWT
        user_id=member.member_id,
        email=ADMIN_EMAIL,
        password_hash=hash_password(ADMIN_PASSWORD),
    )
    db.add(cred)
    db.commit()
    print(f"   ✓ Admin user created  email={ADMIN_EMAIL}  member_id={member.member_id}")
    return member.member_id


async def seed_mongo_analytics(db) -> None:
    """
    Populate MongoDB analytics collections from existing SQL data so the
    Performance tab event-trend chart and Kafka KPI tiles are non-empty
    immediately after seeding, without waiting for real Kafka events.

    Reads real date-aggregated counts from SQL and upserts them into:
      analytics_applications_daily  — from applications.application_datetime
      analytics_saves_daily         — from saved_jobs.saved_at
      analytics_connections_daily   — from connections.created_at
      analytics_job_clicks_daily    — distributes jobs.views_count across dates
    """
    from database import mongo_db as _mongo

    # ── Applications per day ──────────────────────────────────────────────────
    rows = db.execute(text(
        "SELECT DATE(application_datetime) AS d, COUNT(*) AS cnt "
        "FROM applications GROUP BY d ORDER BY d"
    )).fetchall()
    app_count = 0
    for date_val, cnt in rows:
        if not date_val:
            continue
        date_str = str(date_val)
        week_str = date_val.strftime("%G-W%V") if hasattr(date_val, "strftime") else date_str[:7]
        await _mongo.analytics_applications_daily.update_one(
            {"date": date_str},
            {"$set": {"count": int(cnt), "week": week_str}},
            upsert=True,
        )
        app_count += int(cnt)
    print(f"   ✓ analytics_applications_daily: {len(rows)} days, {app_count:,} total")

    # ── Saved jobs per day ────────────────────────────────────────────────────
    rows = db.execute(text(
        "SELECT DATE(saved_at) AS d, COUNT(*) AS cnt "
        "FROM saved_jobs GROUP BY d ORDER BY d"
    )).fetchall()
    saves_count = 0
    for date_val, cnt in rows:
        if not date_val:
            continue
        date_str = str(date_val)
        week_str = date_val.strftime("%G-W%V") if hasattr(date_val, "strftime") else date_str[:7]
        await _mongo.analytics_saves_daily.update_one(
            {"date": date_str},
            {"$set": {"saves": int(cnt), "week": week_str}},
            upsert=True,
        )
        saves_count += int(cnt)
    print(f"   ✓ analytics_saves_daily: {len(rows)} days, {saves_count:,} total")

    # ── Connections per day ───────────────────────────────────────────────────
    # connection.requested = all connections (each started as a request)
    # connection.accepted  = accepted connections only
    req_rows = db.execute(text(
        "SELECT DATE(created_at) AS d, COUNT(*) AS cnt "
        "FROM connections GROUP BY d ORDER BY d"
    )).fetchall()
    acc_rows = db.execute(text(
        "SELECT DATE(created_at) AS d, COUNT(*) AS cnt "
        "FROM connections WHERE status='accepted' GROUP BY d ORDER BY d"
    )).fetchall()
    acc_by_date = {str(d): int(c) for d, c in acc_rows if d}
    conn_days = 0
    for date_val, cnt in req_rows:
        if not date_val:
            continue
        date_str = str(date_val)
        week_str = date_val.strftime("%G-W%V") if hasattr(date_val, "strftime") else date_str[:7]
        await _mongo.analytics_connections_daily.update_one(
            {"date": date_str},
            {"$set": {
                "requested": int(cnt),
                "accepted": acc_by_date.get(date_str, 0),
                "week": week_str,
            }},
            upsert=True,
        )
        conn_days += 1
    print(f"   ✓ analytics_connections_daily: {conn_days} days")

    # ── Job clicks per day (distribute views_count across past 30 days) ───────
    # views_count on each job is a total; distribute it randomly across dates
    # in the same range as applications to produce a realistic daily time-series.
    job_rows = db.execute(text(
        "SELECT job_id, views_count FROM job_postings WHERE views_count > 0 LIMIT 500"
    )).fetchall()
    if job_rows:
        import random as _random
        _random.seed(99)  # stable distribution across re-seeds
        date_rows = db.execute(text(
            "SELECT DISTINCT DATE(application_datetime) AS d "
            "FROM applications ORDER BY d DESC LIMIT 30"
        )).fetchall()
        date_pool = [str(r[0]) for r in date_rows if r[0]]
        if date_pool:
            click_totals: dict = {}
            for job_id, views_count in job_rows:
                for _ in range(int(views_count or 0)):
                    d = _random.choice(date_pool)
                    click_totals[(job_id, d)] = click_totals.get((job_id, d), 0) + 1
            total_clicks = 0
            for (job_id, date_str), clicks in click_totals.items():
                await _mongo.analytics_job_clicks_daily.update_one(
                    {"job_id": job_id, "date": date_str},
                    {"$set": {"clicks": clicks}},
                    upsert=True,
                )
                total_clicks += clicks
            print(f"   ✓ analytics_job_clicks_daily: {len(date_pool)} days, {total_clicks:,} clicks distributed")
        else:
            print("   ℹ analytics_job_clicks_daily: no date range found, skipped")
    else:
        print("   ℹ analytics_job_clicks_daily: no jobs with views_count > 0, skipped")


def run_seed(db, profile: SeedProfile, assume_yes: bool, append: bool = False) -> None:
    existing = db.execute(text("SELECT COUNT(*) FROM members")).scalar()
    if existing > 0 and not append:
        if assume_yes:
            print(f"\n⚠️  Database already has {existing} members.")
            print("   Use --admin-only to add just the admin account without clearing data.")
            print("   Use --append to add more records without clearing.")
            print("   Aborted to protect existing data.")
            return
        response = input(
            f"\n⚠️  Database already has {existing} members. Clear and re-seed? (y/N): "
        )
        if response.lower() != "y":
            print("Aborted.")
            return
        _clear_tables(db)

    seed_members(db, profile)
    seed_recruiters(db, profile)
    seed_jobs(db, profile)

    if append:
        # Query actual max IDs so relationships reference valid rows (existing + new)
        total_mem = db.execute(text("SELECT MAX(member_id) FROM members")).scalar() or profile.members
        total_rec = db.execute(text("SELECT MAX(recruiter_id) FROM recruiters")).scalar() or profile.recruiters
        total_job = db.execute(text("SELECT MAX(job_id) FROM job_postings")).scalar() or profile.jobs
        rel_profile = SeedProfile(
            members=total_mem,
            recruiters=total_rec,
            jobs=total_job,
            applications=profile.applications,
            connections=profile.connections,
            threads=profile.threads,
            msg_per_thread=profile.msg_per_thread,
            saved_jobs=profile.saved_jobs,
            profile_views=profile.profile_views,
            batch_size=profile.batch_size,
        )
    else:
        rel_profile = profile

    seed_applications(db, rel_profile)
    seed_connections(db, rel_profile)
    seed_messages(db, rel_profile)
    seed_saved_jobs(db, rel_profile)
    seed_profile_views(db, rel_profile)

    print("\n🔑 Seeding performance-test user for load tests...")
    seed_perf_test_user(db)

    print("🔑 Seeding admin user (full tab access)...")
    seed_admin_user(db)

    print("\n📊 Seeding MongoDB analytics collections from SQL data...")
    import asyncio as _asyncio
    _asyncio.run(seed_mongo_analytics(db))

    print("\n" + "=" * 60)
    print("  ✅ Seeding complete!")
    print("=" * 60)

    for table in [
        "members", "recruiters", "job_postings", "applications", "connections",
        "threads", "messages", "saved_jobs", "profile_views_daily",
    ]:
        cnt = db.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
        print(f"  {table}: {cnt:,} records")


def main():
    parser = argparse.ArgumentParser(description="Seed LinkedIn platform MySQL tables.")
    parser.add_argument(
        "--quick",
        action="store_true",
        help="Use a small dataset for fast local verification.",
    )
    parser.add_argument(
        "-y",
        "--yes",
        action="store_true",
        help="Do not prompt; clear existing rows and re-seed if needed.",
    )
    parser.add_argument(
        "--admin-only",
        action="store_true",
        help="Only create the admin and perf-test accounts. Never clears existing data.",
    )
    parser.add_argument(
        "--append",
        action="store_true",
        help="Add records without clearing existing data. Relationships use actual DB IDs.",
    )
    parser.add_argument(
        "--1k",
        dest="onek",
        action="store_true",
        help="Use the 1 000-record profile (members=1000, jobs=500, applications=2500).",
    )
    parser.add_argument(
        "--10k",
        dest="tenk",
        action="store_true",
        help="Use the full 10 000-record profile (members=10000, jobs=10000, applications=25000).",
    )
    args = parser.parse_args()

    if args.tenk:
        profile = PROFILE_FULL
    elif args.onek:
        profile = PROFILE_1K
    elif args.quick:
        profile = PROFILE_QUICK
    else:
        profile = PROFILE_FULL

    print("=" * 60)
    print("  LinkedIn Platform — Data Seeder")
    if args.tenk:
        print("  (10k profile)")
    elif args.onek:
        print("  (1k profile)")
    elif args.quick:
        print("  (quick profile)")
    if args.append:
        print("  (append mode — existing data preserved)")
    print("=" * 60)

    db = SessionLocal()
    try:
        if args.admin_only:
            print("\n🔑 Admin-only mode — existing data will not be touched.\n")
            seed_perf_test_user(db)
            seed_admin_user(db)
            print("\n✅ Done.")
            return
        run_seed(db, profile, assume_yes=args.yes, append=args.append)
    finally:
        db.close()


if __name__ == "__main__":
    main()
