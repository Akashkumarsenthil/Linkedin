# Dataset Files

This directory holds raw Kaggle CSV files for the two dataset loaders.
The files are **not committed to the repository** (they are large and subject to Kaggle's terms of service).

---

## Required files

| Filename | Dataset | Source |
|----------|---------|--------|
| `linkedin_job_postings.csv` | LinkedIn Job Postings 2023 (arshkon — substitute; see note in loader script) | https://www.kaggle.com/datasets/arshkon/linkedin-job-postings |
| `resume_dataset.csv` | Resume Dataset (snehaanbhawal — brief-listed) | https://www.kaggle.com/datasets/snehaanbhawal/resume-dataset |

> **Jobs dataset note:** The class brief recommends
> [rajatraj0502/linkedin-job-2023](https://www.kaggle.com/datasets/rajatraj0502/linkedin-job-2023) or
> [joykimaiyo18/linkedin-data-jobs-dataset](https://www.kaggle.com/datasets/joykimaiyo18/linkedin-data-jobs-dataset).
> The loader script targets `arshkon/linkedin-job-postings` because it has a richer column schema.
> See the note in `backend/scripts/load_kaggle_jobs.py` for details.

---

## How to download

### LinkedIn Job Postings 2023

1. Log in to Kaggle: https://www.kaggle.com
2. Navigate to: https://www.kaggle.com/datasets/arshkon/linkedin-job-postings
3. Click **Download** (you will get a ZIP)
4. Unzip and locate `job_postings.csv`
5. Copy it here as `data/linkedin_job_postings.csv`

Expected columns (must be present):

```
title, description, location, min_salary, max_salary, pay_period,
formatted_experience_level, work_type, views, applies, skills_desc,
listed_time, company_id
```

### Resume Dataset

1. Log in to Kaggle: https://www.kaggle.com
2. Navigate to: https://www.kaggle.com/datasets/snehaanbhawal/resume-dataset
3. Click **Download** (you will get a ZIP)
4. Unzip and locate `Resume.csv`
5. Copy it here as `data/resume_dataset.csv`

Expected columns (must be present):

```
Resume_str, Category
```

---

## Running the loaders

From the `backend/` directory:

```bash
# Load real job postings
python scripts/load_kaggle_jobs.py

# Load only first 5000 rows
python scripts/load_kaggle_jobs.py --limit 5000

# Replace existing jobs before loading
python scripts/load_kaggle_jobs.py --clear

# Create new members from resume dataset
python scripts/load_kaggle_resumes.py --mode seed

# Patch resume_text on existing members
python scripts/load_kaggle_resumes.py --mode patch

# Patch only first 2000 members
python scripts/load_kaggle_resumes.py --mode patch --limit 2000
```

---

## .gitignore note

`*.csv` files in this directory are excluded from version control.
The loader scripts gracefully print download instructions if the files are absent.
