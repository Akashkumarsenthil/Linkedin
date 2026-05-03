"""
Job-Candidate Matching Skill
Computes match scores between job requirements and candidate profiles.

Primary method: OpenAI LLM semantic scoring (4 dimensions + reasoning).
Fallback:       Rule-based scoring (skills overlap, location, seniority).
"""

import re
import json
import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

# Seniority level hierarchy for rule-based fallback
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


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _to_list(value) -> list:
    """Normalize skills to a list regardless of storage format."""
    if not value:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        return [s.strip() for s in value.split(",") if s.strip()]
    return []


def _candidate_years(candidate_data: Dict[str, Any], parsed_resume: Optional[Dict[str, Any]]) -> int:
    """Resolve years of experience — parsed resume takes precedence over profile field."""
    years = int(candidate_data.get("years_of_experience", 0) or 0)
    if parsed_resume:
        pr_years = (parsed_resume.get("data") or parsed_resume).get("years_of_experience")
        if pr_years:
            try:
                years = int(pr_years)
            except (TypeError, ValueError):
                pass
    return years


def _candidate_skills(candidate_data: Dict[str, Any], parsed_resume: Optional[Dict[str, Any]]) -> List[str]:
    """Merge profile skills with any skills extracted from a parsed resume."""
    skills = _to_list(candidate_data.get("skills", []))
    if parsed_resume:
        pr_skills = _to_list((parsed_resume.get("data") or parsed_resume).get("skills", []))
        skills = list(set(skills + pr_skills))
    return skills


# ─── LLM scoring ──────────────────────────────────────────────────────────────

async def _score_with_llm(
    job_data: Dict[str, Any],
    candidate_data: Dict[str, Any],
    parsed_resume: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Ask OpenAI to semantically evaluate a candidate against a job posting.

    Returns a dict with success=True/False and, on success, a 'data' key
    containing scores + reasoning across four dimensions:
      - skills_score       (does the candidate have the required tech stack?)
      - location_score     (is the candidate in the right location / open to remote?)
      - seniority_score    (do their years + level match the role?)
      - title_relevance    (how closely does their background map to the job title?)
    """
    from config import settings
    from openai import AsyncOpenAI

    job_skills   = _to_list(job_data.get("skills_required", []))
    cand_skills  = _candidate_skills(candidate_data, parsed_resume)
    years        = _candidate_years(candidate_data, parsed_resume)

    # Build a resume snippet — prefer full resume_text, fall back to parsed summary
    resume_snippet = ""
    if candidate_data.get("resume_text"):
        resume_snippet = str(candidate_data["resume_text"])[:3000]
    elif parsed_resume:
        summary = (parsed_resume.get("data") or parsed_resume).get("summary", "")
        if summary:
            resume_snippet = str(summary)[:1000]

    job_desc = (job_data.get("description") or "")[:1200]

    prompt = f"""You are an expert technical recruiter. Score this candidate for the job below.
Respond ONLY with valid JSON — no markdown, no explanation outside the JSON.

JOB POSTING
-----------
Title       : {job_data.get('title', 'N/A')}
Seniority   : {job_data.get('seniority_level', 'N/A')}
Location    : {job_data.get('location', 'N/A')} | Work mode: {job_data.get('work_mode', 'onsite')}
Required Skills: {', '.join(job_skills) if job_skills else 'Not specified'}
Description : {job_desc if job_desc else 'Not provided'}

CANDIDATE
---------
Headline    : {candidate_data.get('headline', 'N/A')}
Location    : {candidate_data.get('location_city', '')}, {candidate_data.get('location_state', '')}
Skills      : {', '.join(cand_skills) if cand_skills else 'Not specified'}
Years Exp   : {years}
Resume      : {resume_snippet if resume_snippet else 'Not provided'}

Return this exact JSON structure:
{{
    "overall_score": <float 0.0-1.0>,
    "skills_score": <float 0.0-1.0>,
    "location_score": <float 0.0-1.0>,
    "seniority_score": <float 0.0-1.0>,
    "title_relevance_score": <float 0.0-1.0>,
    "skills_reasoning": "<1-2 sentence explanation>",
    "location_reasoning": "<1-2 sentence explanation>",
    "seniority_reasoning": "<1-2 sentence explanation>",
    "title_reasoning": "<1-2 sentence explanation>",
    "recommendation": "<one sentence overall hiring recommendation>",
    "matched_skills": ["<skill>", ...],
    "missing_skills": ["<skill>", ...]
}}"""

    try:
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        completion = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_completion_tokens=600,
            stream=False,
        )
        text = completion.choices[0].message.content or ""
        json_match = re.search(r'\{[\s\S]*\}', text)
        if json_match:
            data = json.loads(json_match.group())
            # Clamp all scores to [0, 1]
            for key in ("overall_score", "skills_score", "location_score",
                        "seniority_score", "title_relevance_score"):
                if key in data:
                    data[key] = max(0.0, min(1.0, float(data[key])))
            return {"success": True, "method": "openai", "data": data}
    except Exception as e:
        logger.warning(f"LLM scoring failed ({e}), falling back to rule-based")

    return {"success": False, "method": "rule_based"}


# ─── Rule-based fallback ──────────────────────────────────────────────────────

def compute_skills_overlap(job_skills: List[str], candidate_skills: List[str]) -> Dict[str, Any]:
    """Compute skills overlap between job requirements and candidate profile."""
    if not job_skills or not candidate_skills:
        return {"score": 0.0, "matched": [], "missing": job_skills or []}

    job_set       = {s.lower().strip() for s in job_skills}
    candidate_set = {s.lower().strip() for s in candidate_skills}

    matched = job_set & candidate_set
    missing = job_set - candidate_set
    score   = len(matched) / len(job_set) if job_set else 0.0

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

    job_loc     = job_location.lower()
    city_match  = candidate_city  and candidate_city.lower()  in job_loc
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


async def _score_rule_based(
    job_data: Dict[str, Any],
    candidate_data: Dict[str, Any],
    parsed_resume: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Rule-based scoring: Skills 50% + Location 20% + Seniority 30%."""
    cand_skills = _candidate_skills(candidate_data, parsed_resume)
    years       = _candidate_years(candidate_data, parsed_resume)

    skills_result   = compute_skills_overlap(
        _to_list(job_data.get("skills_required", [])), cand_skills
    )
    location_result = compute_location_match(
        job_data.get("location", ""),
        candidate_data.get("location_city", ""),
        candidate_data.get("location_state", ""),
        job_data.get("work_mode", "onsite"),
    )
    seniority_result = compute_seniority_match(
        job_data.get("seniority_level", ""), years
    )

    overall_score = (
        skills_result["score"]   * 0.50
        + location_result["score"] * 0.20
        + seniority_result["score"] * 0.30
    )

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
        "scoring_method": "rule_based",
        "breakdown": {
            "skills":   skills_result,
            "location": location_result,
            "seniority": seniority_result,
        },
    }


# ─── Public entry point ───────────────────────────────────────────────────────

async def match_candidate_to_job(
    job_data: Dict[str, Any],
    candidate_data: Dict[str, Any],
    parsed_resume: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Compute an overall match score between a candidate and a job posting.

    Tries OpenAI LLM semantic scoring first (4 dimensions + natural-language
    reasoning).  Falls back to the deterministic rule-based scorer if the LLM
    call fails or returns unparseable output.
    """
    candidate_name = (
        f"{candidate_data.get('first_name', '')} {candidate_data.get('last_name', '')}".strip()
        or f"Candidate #{candidate_data.get('member_id')}"
    )
    meta = {
        "candidate_id":   candidate_data.get("member_id"),
        "candidate_name": candidate_name,
        "job_id":         job_data.get("job_id"),
    }

    # ── Try LLM first ────────────────────────────────────────────────────────
    llm = await _score_with_llm(job_data, candidate_data, parsed_resume)

    if llm["success"]:
        d = llm["data"]
        return {
            **meta,
            "overall_score":    round(d.get("overall_score", 0.0), 3),
            "recommendation":   d.get("recommendation", ""),
            "scoring_method":   "openai_llm",
            "breakdown": {
                "skills": {
                    "score":     d.get("skills_score", 0.0),
                    "matched":   d.get("matched_skills", []),
                    "missing":   d.get("missing_skills", []),
                    "reasoning": d.get("skills_reasoning", ""),
                },
                "location": {
                    "score":     d.get("location_score", 0.0),
                    "reason":    d.get("location_reasoning", ""),
                },
                "seniority": {
                    "score":     d.get("seniority_score", 0.0),
                    "reason":    d.get("seniority_reasoning", ""),
                },
                "title_relevance": {
                    "score":     d.get("title_relevance_score", 0.0),
                    "reason":    d.get("title_reasoning", ""),
                },
            },
        }

    # ── Fallback: rule-based ─────────────────────────────────────────────────
    logger.info("Using rule-based fallback for candidate %s / job %s",
                meta["candidate_id"], meta["job_id"])
    result = await _score_rule_based(job_data, candidate_data, parsed_resume)
    return {**meta, **result}
