"""
Dataset loader: LinkedIn Job Postings 2023 (Kaggle)

Source (used): https://www.kaggle.com/datasets/arshkon/linkedin-job-postings
Brief-listed alternatives: https://www.kaggle.com/datasets/rajatraj0502/linkedin-job-2023
                           https://www.kaggle.com/datasets/joykimaiyo18/linkedin-data-jobs-dataset
Expected file: data/linkedin_job_postings.csv  (place under repo root data/)

NOTE: The class brief lists rajatraj0502/linkedin-job-2023 and joykimaiyo18/linkedin-data-jobs-dataset
as recommended datasets. This script targets arshkon/linkedin-job-postings instead because it provides
a richer column set that maps cleanly to the platform schema. To switch to a brief-listed dataset,
update the column name constants in the "Column mapping" section below to match that CSV's schema.

Run from backend/:
    python scripts/load_kaggle_jobs.py
    python scripts/load_kaggle_jobs.py --limit 5000
    python scripts/load_kaggle_jobs.py --clear

This script ingests real job title, description, location, salary, employment type,
experience level, and view/apply counts from the Kaggle dataset.
Fields without a direct CSV mapping are filled synthetically (company_id, recruiter_id,
work_mode, status, posted_datetime) so every JobPosting row is complete and functional.

Column mapping
--------------
CSV column                 -> DB column              notes
--------------------------    ---------------------- -----------------------------------
title                      -> title                 truncated to 500 chars
description                -> description           used as-is
location                   -> location              city/state kept as-is (max 255)
min_salary / max_salary    -> salary_min/max        normalised to annual (see below)
pay_period                 -> (synthetic helper)    HOURLY x2080, MONTHLY x12, else 1
formatted_experience_level -> seniority_level       mapped to platform enum
work_type                  -> employment_type       FULL_TIME→Full-time, etc.
views                      -> views_count           int, default 0 if missing
applies                    -> applicants_count      int, default 0 if missing
skills_desc                -> skills_required       split on comma/newline into JSON list
listed_time (epoch ms)     -> posted_datetime       converted; today if missing
company_id (CSV)           -> company_id            capped to 1-50 (platform range)
[no CSV field]             -> recruiter_id          synthetic: uniform over seeded range
[no CSV field]             -> work_mode             inferred: "Remote" in location →
                                                    remote, else random hybrid/onsite
[no CSV field]             -> status                open (95%) / closed (5%)
"""

import sys
import os
import argparse
import random
import json
import re
from datetime import datetime
from pathlib import Path

# Allow running from backend/ directory
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

try:
    import pandas as pd
except ImportError:
    print("pandas is required: pip install pandas")
    sys.exit(1)

from tqdm import tqdm
from sqlalchemy import text

from database import SessionLocal
from models.job import JobPosting

# ── Constants ──────────────────────────────────────────────────────────────────

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
CSV_PATH = DATA_DIR / "linkedin_job_postings.csv"

DOWNLOAD_INSTRUCTIONS = """
Dataset not found at:  {path}

To use real LinkedIn job data:

  1. Create a Kaggle account at https://www.kaggle.com
  2. Go to: https://www.kaggle.com/datasets/arshkon/linkedin-job-postings
  3. Click "Download" → download the ZIP
  4. Extract and locate "job_postings.csv"
  5. Copy it to: {path}
  6. Re-run this script

Without the file the platform still works — run seed_data.py for synthetic data.
""".strip()

EXPERIENCE_LEVEL_MAP = {
    "entry level": "Entry-level",
    "associate": "Mid-level",
    "mid-senior level": "Senior",
    "director": "Director",
    "executive": "Director",
    "not applicable": "Mid-level",
    "internship": "Entry-level",
}

WORK_TYPE_MAP = {
    "full_time": "Full-time",
    "part_time": "Part-time",
    "contract": "Contract",
    "temporary": "Contract",
    "internship": "Internship",
    "volunteer": "Part-time",
    "other": "Full-time",
}

PAY_PERIOD_MULTIPLIER = {
    "hourly": 2080,
    "monthly": 12,
    "weekly": 52,
    "biweekly": 26,
    "yearly": 1,
    "annual": 1,
}

BATCH_SIZE = 500

# ── Helpers ────────────────────────────────────────────────────────────────────

def _safe_int(val, default=0) -> int:
    try:
        v = int(float(val))
        return max(0, v)
    except (TypeError, ValueError):
        return default


def _safe_float(val) -> float | None:
    try:
        v = float(val)
        return v if v > 0 else None
    except (TypeError, ValueError):
        return None


def _annual_salary(raw_val, pay_period: str) -> float | None:
    base = _safe_float(raw_val)
    if base is None:
        return None
    mult = PAY_PERIOD_MULTIPLIER.get(str(pay_period).strip().lower(), 1)
    return round(base * mult, 2)


def _map_experience(raw: str) -> str:
    if not raw or str(raw).strip().lower() in ("nan", "none", ""):
        return "Mid-level"
    return EXPERIENCE_LEVEL_MAP.get(str(raw).strip().lower(), "Mid-level")


def _map_work_type(raw: str) -> str:
    if not raw or str(raw).strip().lower() in ("nan", "none", ""):
        return "Full-time"
    return WORK_TYPE_MAP.get(str(raw).strip().lower(), "Full-time")


def _infer_work_mode(location: str) -> str:
    loc = str(location).lower()
    if "remote" in loc:
        return "remote"
    return random.choice(["hybrid", "hybrid", "onsite"])


def _parse_skills(skills_desc: str) -> list[str]:
    """Split a free-text skills description into a list of skill tokens."""
    if not skills_desc or str(skills_desc).strip().lower() in ("nan", "none", ""):
        return []
    raw = str(skills_desc)
    # Split on commas, semicolons, or newlines
    tokens = re.split(r"[,;\n]+", raw)
    skills = [t.strip() for t in tokens if t.strip()]
    # Keep only reasonable-length tokens (skip full sentences)
    return [s[:80] for s in skills if len(s) <= 80][:20]


def _parse_epoch_ms(val) -> datetime | None:
    """Convert epoch-milliseconds (or seconds) to datetime."""
    try:
        ts = float(val)
        if ts > 1e12:
            ts /= 1000
        return datetime.utcfromtimestamp(ts)
    except (TypeError, ValueError):
        return None


def _recruiter_id(n_recruiters: int) -> int:
    return random.randint(1, max(1, n_recruiters))


def _company_id(raw_val) -> int:
    """Use CSV company_id capped to platform range 1-50, or random if invalid."""
    v = _safe_int(raw_val, default=0)
    if 1 <= v <= 50:
        return v
    return random.randint(1, 50)


# ── Loader ─────────────────────────────────────────────────────────────────────

def load_jobs(limit: int | None = None, clear_first: bool = False) -> None:
    if not CSV_PATH.exists():
        print(DOWNLOAD_INSTRUCTIONS.format(path=CSV_PATH))
        sys.exit(1)

    print(f"Reading {CSV_PATH} …")
    df = pd.read_csv(CSV_PATH, low_memory=False)
    print(f"  {len(df):,} rows found in CSV")

    if limit:
        df = df.head(limit)
        print(f"  Limited to first {limit:,} rows")

    db = SessionLocal()
    try:
        if clear_first:
            print("Clearing existing job_postings …")
            db.execute(text("DELETE FROM job_postings"))
            db.execute(text("ALTER TABLE job_postings AUTO_INCREMENT = 1"))
            db.commit()

        # Count existing recruiters to build a valid FK range
        n_recruiters = db.execute(text("SELECT COUNT(*) FROM recruiters")).scalar() or 500
        print(f"  Using recruiter range 1–{n_recruiters}")

        jobs = []
        skipped = 0

        for _, row in tqdm(df.iterrows(), total=len(df), desc="Loading jobs"):
            title = str(row.get("title", "")).strip()[:500]
            if not title or title.lower() in ("nan", "none", ""):
                skipped += 1
                continue

            pay_period = str(row.get("pay_period", "yearly"))
            salary_min = _annual_salary(row.get("min_salary"), pay_period)
            salary_max = _annual_salary(row.get("max_salary"), pay_period)
            if salary_min and salary_max and salary_min > salary_max:
                salary_min, salary_max = salary_max, salary_min

            location = str(row.get("location", "")).strip()[:255] or "Remote"
            posted_dt = _parse_epoch_ms(row.get("listed_time")) or datetime.utcnow()

            job = JobPosting(
                # ── real dataset fields ──────────────────────────────────────
                title=title,
                description=str(row.get("description", "")).strip() or None,
                location=location,
                salary_min=salary_min,
                salary_max=salary_max,
                seniority_level=_map_experience(row.get("formatted_experience_level")),
                employment_type=_map_work_type(row.get("work_type")),
                skills_required=_parse_skills(row.get("skills_desc", "")),
                views_count=_safe_int(row.get("views"), default=0),
                applicants_count=_safe_int(row.get("applies"), default=0),
                posted_datetime=posted_dt,
                # ── synthetic fields ─────────────────────────────────────────
                company_id=_company_id(row.get("company_id")),
                recruiter_id=_recruiter_id(n_recruiters),
                work_mode=_infer_work_mode(location),
                status=random.choices(["open", "closed"], weights=[95, 5], k=1)[0],
            )
            jobs.append(job)

            if len(jobs) >= BATCH_SIZE:
                db.bulk_save_objects(jobs)
                db.commit()
                jobs = []

        if jobs:
            db.bulk_save_objects(jobs)
            db.commit()

        total = db.execute(text("SELECT COUNT(*) FROM job_postings")).scalar()
        print(f"\n✓ Loaded {total:,} job postings into DB ({skipped} rows skipped — missing title)")

    finally:
        db.close()


# ── CLI ────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Load LinkedIn Job Postings 2023 (Kaggle) into the platform DB."
    )
    parser.add_argument("--limit", type=int, default=None,
                        help="Load only the first N rows (default: all)")
    parser.add_argument("--clear", action="store_true",
                        help="Delete existing job_postings rows before loading")
    args = parser.parse_args()
    load_jobs(limit=args.limit, clear_first=args.clear)


if __name__ == "__main__":
    main()
