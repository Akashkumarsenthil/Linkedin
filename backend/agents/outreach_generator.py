"""
Outreach Draft Generator Skill
Generates personalized recruiter outreach messages using Ollama LLM or templates.
"""

import logging
import re
import json
from typing import Dict, Any
from config import settings
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)


async def generate_outreach_with_llm(
    job_data: Dict[str, Any],
    candidate_data: Dict[str, Any],
    match_result: Dict[str, Any],
) -> Dict[str, Any]:
    """Generate a personalized outreach draft using OpenAI LLM."""
    candidate_name = f"{candidate_data.get('first_name', '')} {candidate_data.get('last_name', '')}".strip()
    job_title = job_data.get("title", "this position")
    company = job_data.get("company_name", "our company")
    skills_matched = match_result.get("breakdown", {}).get("skills", {}).get("matched", [])
    score = match_result.get("overall_score", 0)

    prompt = f"""Write a professional, friendly recruiter outreach message for LinkedIn.

Context:
- Candidate name: {candidate_name}
- Candidate headline: {candidate_data.get('headline', 'N/A')}
- Job title: {job_title}
- Company: {company}
- Match score: {score*100:.0f}%
- Skills matched: {', '.join(skills_matched[:5])}
- Job location: {job_data.get('location', 'N/A')}
- Work mode: {job_data.get('work_mode', 'N/A')}

Write a concise, personalized outreach message (150-250 words) that:
1. Opens with something specific about the candidate's background
2. Mentions the role and why they'd be a good fit
3. Highlights the matched skills
4. Ends with a clear call to action

Respond with ONLY the message text, no subject line or extra formatting."""

    try:
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        completion = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[
              {
                "role": "user",
                "content": prompt
              }
            ],
            max_completion_tokens=1024,
            stream=False,
        )

        message = completion.choices[0].message.content or ""
        message = message.strip()
        if message and len(message) > 50:
            return {
                "success": True,
                "method": "openai",
                "subject": f"Exciting {job_title} opportunity at {company}",
                "body": message,
                "candidate_name": candidate_name,
            }
    except Exception as e:
        logger.warning(f"OpenAI API not available for outreach generation: {e}")

    return generate_outreach_template(job_data, candidate_data, match_result)


def generate_outreach_template(
    job_data: Dict[str, Any],
    candidate_data: Dict[str, Any],
    match_result: Dict[str, Any],
) -> Dict[str, Any]:
    """Fallback: generate outreach using templates."""
    candidate_name = f"{candidate_data.get('first_name', '')} {candidate_data.get('last_name', '')}".strip()
    job_title = job_data.get("title", "this position")
    company = job_data.get("company_name", "our company")
    skills_matched = match_result.get("breakdown", {}).get("skills", {}).get("matched", [])
    headline = candidate_data.get("headline", "")
    location = job_data.get("location", "")
    work_mode = job_data.get("work_mode", "onsite")

    skills_text = ", ".join(skills_matched[:4]) if skills_matched else "your background"

    body = f"""Hi {candidate_name or 'there'},

I came across your profile and was impressed by your experience{f' as {headline}' if headline else ''}. Your expertise in {skills_text} really stood out to me.

We have an exciting {job_title} opening{f' at {company}' if company else ''}{f' in {location}' if location else ''} ({work_mode}), and I think you could be a great fit based on your background.

{'The role offers flexible remote work arrangements. ' if work_mode == 'remote' else ''}I'd love to share more details about the position and learn about your career goals.

Would you be open to a brief 15-minute call this week to discuss? Feel free to suggest a time that works best for you.

Looking forward to connecting!"""

    return {
        "success": True,
        "method": "template",
        "subject": f"Exciting {job_title} opportunity — Let's connect!",
        "body": body,
        "candidate_name": candidate_name,
    }
