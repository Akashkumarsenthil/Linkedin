"""
Career Coach Agent Skill
Analyzes a member's current resume/headline against a target job posting
and returns specific, actionable improvement suggestions.

Designed as a stateless microservice skill — no side effects, pure in/out.
"""

import logging
import json
import re
from typing import Dict, Any, Optional
from config import settings
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)


async def coach_resume_with_llm(
    member_headline: str,
    resume_text: str,
    job_title: str,
    job_description: str,
    required_skills: list,
) -> Dict[str, Any]:
    """
    Use OpenAI to produce targeted career coaching suggestions.
    Falls back to heuristic analysis if the API is unavailable.
    """
    skills_str = ", ".join(required_skills[:15]) if required_skills else "Not specified"

    prompt = f"""You are an expert career coach and resume advisor. Analyze the candidate's profile against the target job and provide specific, actionable suggestions.

CANDIDATE PROFILE:
Headline: {member_headline or 'Not provided'}
Resume: {resume_text[:1500] if resume_text else 'Not provided'}

TARGET JOB:
Title: {job_title}
Required Skills: {skills_str}
Description: {job_description[:800] if job_description else 'Not provided'}

Provide a JSON response with exactly this structure:
{{
  "headline_suggestion": "An improved LinkedIn headline (max 220 chars) tailored for this role",
  "summary_suggestion": "A 2-3 sentence professional summary for their profile targeting this role",
  "skills_to_add": ["skill1", "skill2", "skill3"],
  "skills_to_highlight": ["skill1", "skill2"],
  "experience_tips": ["Specific tip 1 about how to reframe their experience", "Specific tip 2"],
  "overall_score": 0.72,
  "score_rationale": "Brief explanation of the match score",
  "top_gaps": ["gap1", "gap2"]
}}

Be specific and actionable. Do NOT be generic. Reference actual details from the candidate's profile."""

    try:
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        completion = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_completion_tokens=2048,
        )
        raw = completion.choices[0].message.content or "{}"
        json_match = re.search(r'\{[\s\S]*\}', raw)
        if json_match:
            data = json.loads(json_match.group())
            return {"success": True, "method": "openai", "data": data}
    except Exception as e:
        logger.warning(f"OpenAI unavailable for career coach: {e}")

    # Fallback: heuristic analysis
    return _heuristic_coach(member_headline, resume_text, job_title, required_skills)


def _heuristic_coach(
    headline: str,
    resume_text: str,
    job_title: str,
    required_skills: list,
) -> Dict[str, Any]:
    """Rule-based coaching fallback when LLM is unavailable."""
    resume_lower = (resume_text or "").lower()
    headline_lower = (headline or "").lower()

    matched = [s for s in required_skills if s.lower() in resume_lower]
    missing = [s for s in required_skills if s.lower() not in resume_lower]

    score = len(matched) / max(len(required_skills), 1)

    # Check if job title keywords are in headline
    title_words = [w for w in job_title.lower().split() if len(w) > 3]
    headline_has_title = any(w in headline_lower for w in title_words)

    headline_suggestion = (
        headline
        if headline_has_title
        else f"{headline} | {job_title} Specialist" if headline else f"Experienced {job_title}"
    )

    return {
        "success": True,
        "method": "heuristic",
        "data": {
            "headline_suggestion": headline_suggestion[:220],
            "summary_suggestion": (
                f"Results-driven professional with expertise in {', '.join(matched[:3]) or 'relevant technologies'}. "
                f"Seeking to apply my skills to a {job_title} role where I can deliver meaningful impact."
            ),
            "skills_to_add": missing[:5],
            "skills_to_highlight": matched[:5],
            "experience_tips": [
                f"Quantify your achievements with metrics (e.g., 'reduced latency by 30%')",
                f"Add keywords from the job description: {', '.join(missing[:3])}",
                "Use action verbs: Architected, Optimized, Delivered, Led",
            ],
            "overall_score": round(score, 2),
            "score_rationale": f"Matched {len(matched)}/{len(required_skills)} required skills",
            "top_gaps": missing[:3],
        },
    }
