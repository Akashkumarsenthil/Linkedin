"""
Job-Candidate Matching Skill
Computes match scores between job requirements and candidate profiles
using skills overlap, location matching, and seniority alignment.
"""

import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

# Seniority level hierarchy for matching
SENIORITY_LEVELS = {
    "intern": 0, "internship": 0,
    "entry": 1, "entry-level": 1, "junior": 1,
    "mid": 2, "mid-level": 2, "associate": 2,
    "senior": 3, "sr": 3,
    "lead": 4, "staff": 4, "principal": 4,
    "director": 5,
    "vp": 6, "vice president": 6,
    "c-level": 7, "executive": 7,
}


def compute_skills_overlap(job_skills: List[str], candidate_skills: List[str]) -> Dict[str, Any]:
    """Compute skills overlap between job requirements and candidate profile."""
    if not job_skills or not candidate_skills:
        return {"score": 0.0, "matched": [], "missing": job_skills or []}

    job_set = {s.lower().strip() for s in job_skills}
    candidate_set = {s.lower().strip() for s in candidate_skills}

    matched = job_set & candidate_set
    missing = job_set - candidate_set

    score = len(matched) / len(job_set) if job_set else 0.0

    return {
        "score": round(score, 3),
        "matched": sorted(list(matched)),
        "missing": sorted(list(missing)),
        "extra_skills": sorted(list(candidate_set - job_set))[:10],
    }


def compute_location_match(job_location: str, candidate_city: str, 
                            candidate_state: str, work_mode: str) -> Dict[str, Any]:
    """Compute location compatibility."""
    if not job_location:
        return {"score": 1.0, "reason": "No location requirement"}

    if work_mode == "remote":
        return {"score": 1.0, "reason": "Remote position — location flexible"}

    job_loc = job_location.lower()
    city_match = candidate_city and candidate_city.lower() in job_loc
    state_match = candidate_state and candidate_state.lower() in job_loc

    if city_match:
        return {"score": 1.0, "reason": "City match"}
    elif state_match:
        return {"score": 0.7, "reason": "State match (different city)"}
    elif work_mode == "hybrid":
        return {"score": 0.4, "reason": "Hybrid — may need relocation"}
    else:
        return {"score": 0.2, "reason": "Location mismatch — relocation required"}


def compute_seniority_match(job_seniority: str, candidate_years: int) -> Dict[str, Any]:
    """Compute seniority level alignment."""
    if not job_seniority:
        return {"score": 0.8, "reason": "No seniority requirement specified"}

    job_level = SENIORITY_LEVELS.get(job_seniority.lower(), 2)

    # Estimate candidate level from years of experience
    if candidate_years <= 1:
        candidate_level = 1
    elif candidate_years <= 3:
        candidate_level = 2
    elif candidate_years <= 6:
        candidate_level = 3
    elif candidate_years <= 10:
        candidate_level = 4
    else:
        candidate_level = 5

    diff = abs(job_level - candidate_level)
    if diff == 0:
        return {"score": 1.0, "reason": "Perfect seniority match"}
    elif diff == 1:
        return {"score": 0.7, "reason": "Close seniority match"}
    elif diff == 2:
        return {"score": 0.4, "reason": "Moderate seniority gap"}
    else:
        return {"score": 0.1, "reason": f"Significant seniority mismatch (gap: {diff})"}


async def match_candidate_to_job(
    job_data: Dict[str, Any],
    candidate_data: Dict[str, Any],
    parsed_resume: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Compute an overall match score between a candidate and a job posting.
    
    Weights:
    - Skills overlap: 50%
    - Location match: 20%
    - Seniority match: 30%
    """
    # Get candidate skills from profile or parsed resume
    candidate_skills = candidate_data.get("skills", [])
    if parsed_resume and parsed_resume.get("data", {}).get("skills"):
        candidate_skills = list(
            set(candidate_skills + parsed_resume["data"]["skills"])
        )

    # Skills overlap
    skills_result = compute_skills_overlap(
        job_data.get("skills_required", []),
        candidate_skills,
    )

    # Location match
    location_result = compute_location_match(
        job_data.get("location", ""),
        candidate_data.get("location_city", ""),
        candidate_data.get("location_state", ""),
        job_data.get("work_mode", "onsite"),
    )

    # Seniority match
    years = 0
    if parsed_resume and parsed_resume.get("data", {}).get("years_of_experience"):
        years = parsed_resume["data"]["years_of_experience"]
    seniority_result = compute_seniority_match(
        job_data.get("seniority_level", ""),
        years,
    )

    # Weighted overall score
    overall_score = (
        skills_result["score"] * 0.50
        + location_result["score"] * 0.20
        + seniority_result["score"] * 0.30
    )

    # Generate recommendation
    if overall_score >= 0.8:
        recommendation = "Strong Match — highly recommended for interview"
    elif overall_score >= 0.6:
        recommendation = "Good Match — worth considering"
    elif overall_score >= 0.4:
        recommendation = "Moderate Match — review profile for specific strengths"
    else:
        recommendation = "Weak Match — significant gaps in requirements"

    return {
        "overall_score": round(overall_score, 3),
        "recommendation": recommendation,
        "breakdown": {
            "skills": skills_result,
            "location": location_result,
            "seniority": seniority_result,
        },
        "candidate_id": candidate_data.get("member_id"),
        "job_id": job_data.get("job_id"),
    }
