"""
Dataset loader: Resume Dataset (Kaggle)

Source: https://www.kaggle.com/datasets/snehaanbhawal/resume-dataset
Expected file: data/resume_dataset.csv  (place under repo root data/)

Run from backend/:
    python scripts/load_kaggle_resumes.py
    python scripts/load_kaggle_resumes.py --limit 2000
    python scripts/load_kaggle_resumes.py --mode seed    # creates new members
    python scripts/load_kaggle_resumes.py --mode patch   # updates resume_text on existing members

Modes
-----
seed  (default)
    Creates brand-new Member rows, one per CSV resume.
    The real resume text (Resume_str) populates resume_text.
    The Category column drives skills inference and headline generation.
    All PII fields (name, email, phone, location) are synthetic.

patch
    Pulls existing members in random order and replaces their resume_text
    with real resume text from the CSV.  Useful after seed_data.py to
    upgrade synthetic resume blocks with real text.

Column mapping
--------------
CSV column   -> DB column           notes
-----------     ------------------- -------------------------------------------
Resume_str   -> resume_text         real; cleaned of HTML/whitespace
Category     -> skills (JSON)       mapped to canonical TECH_SKILLS subset
Category     -> headline            e.g. "Data Science" -> "{title} | Data Science"
[no CSV]     -> first_name          synthetic (Faker)
[no CSV]     -> last_name           synthetic (Faker)
[no CSV]     -> email               synthetic unique (Faker)
[no CSV]     -> phone               synthetic (Faker)
[no CSV]     -> location_*          synthetic (from CITIES pool)
[no CSV]     -> experience          synthetic (JSON)
[no CSV]     -> education           synthetic (JSON)
[no CSV]     -> connections_count   random 0-500
[no CSV]     -> profile_views       random 0-1000
"""

import sys
import re
import json
import random
import argparse
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

try:
    import pandas as pd
except ImportError:
    print("pandas is required: pip install pandas")
    sys.exit(1)

from faker import Faker
from tqdm import tqdm
from sqlalchemy import text

from database import SessionLocal
from models.member import Member

fake = Faker()
Faker.seed(99)
random.seed(99)

# ── Constants ──────────────────────────────────────────────────────────────────

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
CSV_PATH = DATA_DIR / "resume_dataset.csv"

DOWNLOAD_INSTRUCTIONS = """
Dataset not found at:  {path}

To use real resume data:

  1. Create a Kaggle account at https://www.kaggle.com
  2. Go to: https://www.kaggle.com/datasets/snehaanbhawal/resume-dataset
  3. Click "Download" → download the ZIP
  4. Extract and locate "Resume.csv" (or "resume_dataset.csv")
  5. Copy it to: {path}
  6. Re-run this script

Without the file the platform still works — run seed_data.py for synthetic resumes.
""".strip()

CITIES = [
    ("San Francisco", "California", "USA"),
    ("New York", "New York", "USA"),
    ("Seattle", "Washington", "USA"),
    ("Austin", "Texas", "USA"),
    ("Chicago", "Illinois", "USA"),
    ("Boston", "Massachusetts", "USA"),
    ("Los Angeles", "California", "USA"),
    ("Atlanta", "Georgia", "USA"),
    ("Denver", "Colorado", "USA"),
    ("Remote", "", ""),
]

JOB_TITLES = [
    "Software Engineer", "Senior Software Engineer", "Data Scientist", "Data Engineer",
    "ML Engineer", "DevOps Engineer", "Full-Stack Developer", "Backend Developer",
    "Frontend Developer", "Product Manager", "Cloud Architect", "Security Engineer",
]

# Category → canonical skill tags (subset of TECH_SKILLS in seed_data.py)
CATEGORY_SKILLS_MAP: dict[str, list[str]] = {
    "data science": ["Python", "Machine Learning", "Pandas", "NumPy", "Scikit-learn",
                     "Deep Learning", "TensorFlow", "Statistics"],
    "information-technology": ["Java", "Python", "SQL", "Linux", "Docker", "AWS", "REST API"],
    "hr": ["Recruiting", "Talent Acquisition", "Onboarding", "HRIS", "Excel"],
    "advocate": ["Legal Research", "Communication", "Documentation", "Microsoft Office"],
    "arts": ["Adobe Creative Suite", "Photoshop", "Illustrator", "UX Design", "Figma"],
    "web designing": ["HTML", "CSS", "JavaScript", "React", "UI/UX", "Figma"],
    "mechanical engineer": ["CAD", "SolidWorks", "FEA", "Project Management", "AutoCAD"],
    "sales": ["CRM", "Salesforce", "B2B Sales", "Lead Generation", "Excel"],
    "health and fitness": ["Exercise Science", "Nutrition", "Coaching", "CPR"],
    "civil engineer": ["AutoCAD", "Structural Analysis", "Project Management", "Revit"],
    "java developer": ["Java", "Spring Boot", "Microservices", "SQL", "REST API", "Maven"],
    "business analyst": ["SQL", "Tableau", "Excel", "Business Intelligence", "Agile"],
    "sap developer": ["SAP ABAP", "SAP HANA", "SAP BTP", "SQL", "ERP"],
    "automation testing": ["Selenium", "Python", "Java", "TestNG", "CI/CD", "Jenkins"],
    "electrical engineering": ["Circuit Design", "MATLAB", "PLC Programming", "AutoCAD"],
    "operations manager": ["Supply Chain", "Six Sigma", "ERP", "Project Management", "Excel"],
    "python developer": ["Python", "Django", "Flask", "FastAPI", "SQL", "AWS", "Docker"],
    "devops engineer": ["Docker", "Kubernetes", "CI/CD", "Terraform", "AWS", "Linux", "Jenkins"],
    "network security engineer": ["Firewall", "VPN", "Penetration Testing", "SIEM", "Linux"],
    "pmo": ["MS Project", "Agile", "Scrum", "Risk Management", "Stakeholder Management"],
    "database": ["SQL", "MySQL", "PostgreSQL", "MongoDB", "Oracle", "Database Design"],
    "hadoop": ["Hadoop", "Spark", "Hive", "HDFS", "MapReduce", "Kafka", "Python"],
    "etl developer": ["ETL", "SQL", "Python", "Informatica", "SSIS", "Data Warehousing"],
    "blockchain": ["Solidity", "Ethereum", "Web3.js", "Smart Contracts", "Cryptography"],
    "testing": ["Manual Testing", "Selenium", "JUnit", "Bug Tracking", "Agile"],
    "arts": ["Creativity", "Communication", "Content Writing", "Adobe Suite"],
}

DEFAULT_SKILLS = ["Python", "SQL", "Communication", "Problem Solving", "Git"]

BATCH_SIZE = 500


# ── Helpers ────────────────────────────────────────────────────────────────────

def _clean_resume(text: str) -> str:
    """Strip HTML tags and collapse whitespace."""
    clean = re.sub(r"<[^>]+>", " ", str(text))
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean


def _skills_from_category(category: str) -> list[str]:
    key = str(category).strip().lower()
    return CATEGORY_SKILLS_MAP.get(key, DEFAULT_SKILLS)


def _headline_from_category(category: str, title: str) -> str:
    cat = str(category).strip().title()
    return f"{title} | {cat}"[:500]


def _synthetic_member_fields() -> dict:
    city, state, country = random.choice(CITIES)
    return dict(
        first_name=fake.first_name(),
        last_name=fake.last_name(),
        email=f"{fake.first_name().lower()}.{fake.last_name().lower()}{random.randint(1, 999999)}@{fake.free_email_domain()}",
        phone=fake.phone_number()[:20],
        location_city=city,
        location_state=state,
        location_country=country,
        experience=json.dumps([
            {"title": random.choice(JOB_TITLES),
             "company": fake.company(),
             "years": random.randint(1, 5)}
            for _ in range(random.randint(1, 3))
        ]),
        education=json.dumps([{
            "degree": random.choice(["BS", "MS", "PhD", "MBA"]),
            "field": random.choice(["Computer Science", "Data Science", "Engineering"]),
            "school": random.choice(["Stanford", "MIT", "CMU", "SJSU", "UC Berkeley"]),
            "year": random.randint(2010, 2024),
        }]),
        connections_count=random.randint(0, 500),
        profile_views=random.randint(0, 1000),
    )


# ── Loaders ────────────────────────────────────────────────────────────────────

def _load_df() -> pd.DataFrame:
    if not CSV_PATH.exists():
        print(DOWNLOAD_INSTRUCTIONS.format(path=CSV_PATH))
        sys.exit(1)
    print(f"Reading {CSV_PATH} …")
    df = pd.read_csv(CSV_PATH, low_memory=False)
    # Support both "Resume_str" (dataset default) and "resume_str" variations
    col_map = {c.lower(): c for c in df.columns}
    if "resume_str" in col_map:
        df = df.rename(columns={col_map["resume_str"]: "Resume_str"})
    if "category" in col_map:
        df = df.rename(columns={col_map["category"]: "Category"})
    print(f"  {len(df):,} rows found in CSV")
    return df


def seed_members_from_resumes(limit: int | None = None) -> None:
    """Create new Member rows seeded with real resume text."""
    df = _load_df()
    if limit:
        df = df.head(limit)
        print(f"  Limited to first {limit:,} rows")

    db = SessionLocal()
    used_emails: set[str] = set()
    members = []
    skipped = 0

    try:
        for _, row in tqdm(df.iterrows(), total=len(df), desc="Seeding members from resumes"):
            resume_raw = str(row.get("Resume_str", "")).strip()
            if not resume_raw or resume_raw.lower() in ("nan", "none", ""):
                skipped += 1
                continue

            resume_text = _clean_resume(resume_raw)
            category = str(row.get("Category", "information-technology"))
            skills = _skills_from_category(category)
            title = random.choice(JOB_TITLES)

            fields = _synthetic_member_fields()
            # Ensure unique email
            while fields["email"] in used_emails:
                fields["email"] = (
                    f"{fake.first_name().lower()}{random.randint(1, 9999999)}"
                    f"@{fake.free_email_domain()}"
                )
            used_emails.add(fields["email"])

            member = Member(
                **fields,
                headline=_headline_from_category(category, title),
                about=fake.paragraph(nb_sentences=3),
                skills=json.dumps(skills),
                resume_text=resume_text,
            )
            members.append(member)

            if len(members) >= BATCH_SIZE:
                db.bulk_save_objects(members)
                db.commit()
                members = []

        if members:
            db.bulk_save_objects(members)
            db.commit()

        total = db.execute(text("SELECT COUNT(*) FROM members")).scalar()
        print(f"\n✓ Seeded members from resumes. Total in DB: {total:,} ({skipped} rows skipped)")

    finally:
        db.close()


def patch_resume_text(limit: int | None = None) -> None:
    """
    Update existing Member rows with real resume text.
    Pulls members in insertion order and pairs them with CSV rows.
    Members beyond the CSV row count keep their synthetic resume text.
    """
    df = _load_df()
    if limit:
        df = df.head(limit)
        print(f"  Limited to first {limit:,} rows")

    db = SessionLocal()
    try:
        member_ids = [
            row[0] for row in db.execute(
                text("SELECT member_id FROM members ORDER BY member_id LIMIT :n"),
                {"n": len(df)},
            )
        ]
        print(f"  Patching {min(len(member_ids), len(df)):,} members …")
        updated = 0

        for mid, (_, row) in tqdm(
            zip(member_ids, df.iterrows()), total=min(len(member_ids), len(df)),
            desc="Patching resume_text"
        ):
            resume_raw = str(row.get("Resume_str", "")).strip()
            if not resume_raw or resume_raw.lower() in ("nan", "none", ""):
                continue
            db.execute(
                text("UPDATE members SET resume_text = :rt WHERE member_id = :mid"),
                {"rt": _clean_resume(resume_raw), "mid": mid},
            )
            updated += 1
            if updated % BATCH_SIZE == 0:
                db.commit()

        db.commit()
        print(f"\n✓ Updated resume_text on {updated:,} existing members")

    finally:
        db.close()


# ── CLI ────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Load Kaggle Resume Dataset into the platform DB."
    )
    parser.add_argument(
        "--mode",
        choices=["seed", "patch"],
        default="seed",
        help=(
            "seed: create new Member rows with real resume text (default). "
            "patch: update resume_text on existing members."
        ),
    )
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Process only the first N rows (default: all)"
    )
    args = parser.parse_args()

    if args.mode == "seed":
        seed_members_from_resumes(limit=args.limit)
    else:
        patch_resume_text(limit=args.limit)


if __name__ == "__main__":
    main()
