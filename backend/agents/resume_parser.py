"""
Resume Parser Skill
Extracts structured fields from resume text using Ollama LLM or regex fallback.
"""

import re
import json
import logging
import httpx
from typing import Dict, Any
from config import settings

logger = logging.getLogger(__name__)

# Common skills list for regex-based extraction
COMMON_SKILLS = [
    "python", "java", "javascript", "typescript", "c++", "c#", "go", "rust", "ruby",
    "sql", "nosql", "mysql", "postgresql", "mongodb", "redis", "elasticsearch",
    "react", "angular", "vue", "node.js", "express", "django", "flask", "fastapi",
    "spring", "spring boot", "docker", "kubernetes", "aws", "azure", "gcp",
    "terraform", "jenkins", "ci/cd", "git", "linux", "kafka", "rabbitmq",
    "machine learning", "deep learning", "nlp", "computer vision", "tensorflow",
    "pytorch", "scikit-learn", "pandas", "numpy", "spark", "hadoop", "airflow",
    "data engineering", "data science", "devops", "microservices", "rest api",
    "graphql", "agile", "scrum", "product management", "project management",
]


async def parse_resume_with_ollama(resume_text: str) -> Dict[str, Any]:
    """Use Ollama local LLM to extract structured data from resume text."""
    prompt = f"""Extract the following information from this resume text and respond ONLY with valid JSON (no markdown, no explanation):

{{
    "name": "full name",
    "email": "email if found",
    "phone": "phone if found",
    "skills": ["list of technical skills"],
    "years_of_experience": estimated total years as number,
    "education": [{{"degree": "degree name", "school": "school name", "year": "graduation year"}}],
    "experience": [{{"title": "job title", "company": "company name", "duration": "duration"}}],
    "summary": "2-3 sentence professional summary"
}}

Resume text:
{resume_text[:3000]}"""

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(
                f"{settings.OLLAMA_BASE_URL}/api/generate",
                json={
                    "model": settings.OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.1},
                },
            )

            if response.status_code == 200:
                result = response.json()
                text = result.get("response", "")
                # Try to parse JSON from the response
                try:
                    # Find JSON block in response
                    json_match = re.search(r'\{[\s\S]*\}', text)
                    if json_match:
                        parsed = json.loads(json_match.group())
                        return {"success": True, "method": "ollama", "data": parsed}
                except json.JSONDecodeError:
                    logger.warning("Ollama returned non-JSON response, falling back to regex")

    except (httpx.ConnectError, httpx.TimeoutException) as e:
        logger.warning(f"Ollama not available ({e}), using regex fallback")

    return await parse_resume_with_regex(resume_text)


async def parse_resume_with_regex(resume_text: str) -> Dict[str, Any]:
    """Fallback: extract structured data using regex patterns."""
    text_lower = resume_text.lower()

    # Extract email
    email_match = re.search(r'[\w.+-]+@[\w-]+\.[\w.]+', resume_text)
    email = email_match.group() if email_match else None

    # Extract phone
    phone_match = re.search(r'[\+]?[(]?[0-9]{1,4}[)]?[-\s\./0-9]{7,15}', resume_text)
    phone = phone_match.group() if phone_match else None

    # Extract skills
    found_skills = [skill for skill in COMMON_SKILLS if skill in text_lower]

    # Estimate years of experience
    years_match = re.findall(r'(\d+)\+?\s*(?:years?|yrs?)\s*(?:of\s+)?(?:experience|exp)', text_lower)
    years = max([int(y) for y in years_match], default=0)

    # Extract education keywords
    education = []
    edu_patterns = [
        r"(bachelor|master|phd|doctorate|mba|b\.?s\.?|m\.?s\.?|b\.?a\.?|m\.?a\.?)\s*(?:of|in|'s)?\s*([\w\s]+?)(?:from|at|,|\n)",
    ]
    for pattern in edu_patterns:
        matches = re.findall(pattern, text_lower)
        for match in matches[:3]:
            education.append({"degree": match[0].strip(), "field": match[1].strip()})

    return {
        "success": True,
        "method": "regex_fallback",
        "data": {
            "email": email,
            "phone": phone,
            "skills": found_skills,
            "years_of_experience": years,
            "education": education,
            "summary": resume_text[:200] + "..." if len(resume_text) > 200 else resume_text,
        },
    }
