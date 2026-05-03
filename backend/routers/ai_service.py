"""
AI Service Router — REST + WebSocket endpoints for Agentic AI workflows.
"""

import logging
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, File, UploadFile, Form, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any

from auth import require_recruiter, TokenPayload
from agents.hiring_assistant import (
    start_task, get_task_status, approve_task,
    ws_connections, active_tasks, get_queue_stats,
)
from agents.resume_parser import parse_resume_with_llm
from agents.job_matcher import match_candidate_to_job
from database import get_db
from models.job import JobPosting
from models.application import Application

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["AI Agent Service"])


# ─── Schemas ────────────────────────────────────────────────────

class AnalyzeCandidatesRequest(BaseModel):
    job_id: int = Field(..., description="Job posting ID to analyze candidates for")
    top_n: int = Field(5, ge=1, le=50, description="Number of top candidates to shortlist")

    model_config = {
        "json_schema_extra": {
            "examples": [{"job_id": 1, "top_n": 5}]
        }
    }


class TaskStatusRequest(BaseModel):
    task_id: str = Field(..., description="AI task ID")


class ApproveRequest(BaseModel):
    task_id: str = Field(..., description="AI task ID to approve/reject")
    approved: bool = Field(..., description="True to approve, False to reject")
    feedback: str = Field("", description="Optional feedback from the recruiter")


class ParseResumeRequest(BaseModel):
    resume_text: str = Field(..., min_length=10, description="Resume text to parse")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "resume_text": "John Doe | Senior Software Engineer | john@example.com\n\n8+ years of experience in Python, Java, and cloud technologies. Led a team of 5 engineers at Google working on distributed systems using Kubernetes and AWS. MS in Computer Science from Stanford University (2018). Skills: Python, Java, Kubernetes, Docker, AWS, GCP, FastAPI, PostgreSQL, Kafka, Microservices."
                }
            ]
        }
    }


class MatchRequest(BaseModel):
    job_data: Dict[str, Any] = Field(..., description="Job posting data")
    candidate_data: Dict[str, Any] = Field(..., description="Candidate profile data")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "job_data": {
                        "job_id": 1,
                        "title": "Senior Backend Engineer",
                        "skills_required": ["Python", "FastAPI", "Kafka"],
                        "location": "San Francisco, CA",
                        "work_mode": "hybrid",
                        "seniority_level": "Senior"
                    },
                    "candidate_data": {
                        "member_id": 1,
                        "skills": ["Python", "FastAPI", "Docker", "AWS"],
                        "location_city": "San Jose",
                        "location_state": "California"
                    }
                }
            ]
        }
    }


class AIResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Any] = None


class CandidateDecisionRequest(BaseModel):
    candidate_id: int = Field(..., description="Member ID of the candidate")
    job_id: int = Field(..., description="Job posting ID")
    decision: str = Field(..., description="interview | selected | rejected")


# ─── Endpoints ──────────────────────────────────────────────────

@router.post("/analyze-candidates", response_model=AIResponse, summary="Start candidate analysis workflow")
async def analyze_candidates(
    req: AnalyzeCandidatesRequest,
    current_user: TokenPayload = Depends(require_recruiter),
    db: Session = Depends(get_db),
):
    """
    Start the Hiring Assistant multi-step AI workflow:
    1. Parse resumes for all candidates
    2. Match candidates against job requirements
    3. Rank and shortlist top N candidates
    4. Generate personalized outreach drafts
    
    Returns a task_id to track progress via /ai/task-status or WebSocket.
    """
    if current_user.user_type != "admin":
        job = db.query(JobPosting).filter(JobPosting.job_id == req.job_id).first()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        if job.recruiter_id != current_user.user_id:
            raise HTTPException(status_code=403, detail="You can only analyze candidates for jobs you created")

    task_id = await start_task(req.job_id, req.top_n)
    return AIResponse(
        success=True,
        message=f"AI analysis started. Use task_id to track progress.",
        data={"task_id": task_id, "job_id": req.job_id},
    )


@router.post("/task-status", response_model=AIResponse, summary="Get AI task status")
async def task_status(req: TaskStatusRequest):
    """Check the current status and progress of an AI task."""
    status = await get_task_status(req.task_id)
    if not status:
        return AIResponse(success=False, message=f"Task {req.task_id} not found")
    return AIResponse(success=True, message=f"Task status: {status['status']}", data=status)


@router.get("/task-status/{task_id}", response_model=AIResponse, summary="Get AI task status (GET)")
async def task_status_get(task_id: str):
    """Get task status by task_id via GET. Easier to call from frontend."""
    status = await get_task_status(task_id)
    if not status:
        return AIResponse(success=False, message=f"Task {task_id} not found")
    return AIResponse(success=True, message=f"Task status: {status['status']}", data=status)


@router.post("/approve", response_model=AIResponse, summary="Approve or reject AI output")
async def approve_output(
    req: ApproveRequest,
    current_user: TokenPayload = Depends(require_recruiter),
):
    """
    Human-in-the-loop: approve or reject the AI-generated shortlist and outreach drafts.
    The recruiter must review the AI output before any action is taken.
    """
    result = await approve_task(req.task_id, req.approved, req.feedback)
    return AIResponse(**result)


@router.post("/parse-resume", response_model=AIResponse, summary="Parse a resume (standalone skill)")
async def parse_resume(req: ParseResumeRequest):
    """
    Standalone resume parsing endpoint. Uses Groq LLM with regex fallback.
    Extracts: skills, experience, education, contact info, summary.
    """
    result = await parse_resume_with_llm(req.resume_text)
    return AIResponse(
        success=result["success"],
        message=f"Resume parsed using {result['method']}",
        data=result,
    )


@router.post("/match", response_model=AIResponse, summary="Match a candidate to a job (standalone skill)")
async def match_candidate(req: MatchRequest):
    """
    Standalone job-candidate matching endpoint.
    Computes match score based on skills overlap (50%), location (20%), seniority (30%).
    """
    result = await match_candidate_to_job(req.job_data, req.candidate_data)
    return AIResponse(
        success=True,
        message=f"Match score: {result['overall_score']:.1%} — {result['recommendation']}",
        data=result,
    )


# ─── PDF text extraction helper ───────────────────────────────────────────────

def _extract_pdf_text(file_bytes: bytes) -> str:
    """Extract plain text from a PDF using PyPDF2. Raises ValueError on failure."""
    import io
    try:
        from PyPDF2 import PdfReader
        reader = PdfReader(io.BytesIO(file_bytes))
        pages = [page.extract_text() or "" for page in reader.pages]
        text = "\n\n".join(p.strip() for p in pages if p.strip())
        return text
    except Exception as exc:
        raise ValueError(f"Could not read PDF: {exc}") from exc


# ─── PDF endpoints ────────────────────────────────────────────────────────────

@router.post("/parse-resume-pdf", response_model=AIResponse, summary="Parse a resume from a PDF upload")
async def parse_resume_pdf(
    file: UploadFile = File(..., description="PDF resume — max 5 MB"),
):
    """
    Upload a PDF resume and extract structured candidate data.
    Accepts multipart/form-data with a single 'file' field (PDF only).
    Returns the same structure as POST /ai/parse-resume.
    """
    if not (file.filename or "").lower().endswith(".pdf"):
        return AIResponse(success=False, message="Only .pdf files are accepted.")

    raw = await file.read()
    if len(raw) > 5 * 1024 * 1024:
        return AIResponse(success=False, message="File too large — 5 MB maximum.")

    try:
        resume_text = _extract_pdf_text(raw)
    except ValueError as exc:
        return AIResponse(success=False, message=str(exc))

    if not resume_text.strip():
        return AIResponse(
            success=False,
            message="No text could be extracted. The PDF may be image-based or password-protected.",
        )

    result = await parse_resume_with_llm(resume_text)
    result["extracted_text_preview"] = resume_text
    return AIResponse(
        success=result["success"],
        message=f"Resume parsed from PDF using {result['method']}",
        data=result,
    )


@router.post("/career-coach-pdf", response_model=AIResponse, summary="Career Coach with PDF resume upload")
async def career_coach_pdf(
    file: UploadFile = File(..., description="PDF resume — max 5 MB"),
    job_title: str = Form(""),
    required_skills: str = Form("", description="Comma-separated skills"),
    headline: str = Form("", description="Current LinkedIn headline"),
    job_id: str = Form("", description="Job ID to auto-fill job details from DB"),
):
    """
    Upload a PDF resume for Career Coach analysis.
    Accepts multipart/form-data:
      - file            PDF resume
      - job_title       Target job title
      - required_skills Comma-separated skills string
      - headline        Member's current LinkedIn headline (optional)
      - job_id          Fetches job details automatically from DB (optional)
    """
    from agents.career_coach import coach_resume_with_llm
    from database import SessionLocal
    from models.job import JobPosting

    if not (file.filename or "").lower().endswith(".pdf"):
        return AIResponse(success=False, message="Only .pdf files are accepted.")

    raw = await file.read()
    if len(raw) > 5 * 1024 * 1024:
        return AIResponse(success=False, message="File too large — 5 MB maximum.")

    try:
        resume_text = _extract_pdf_text(raw)
    except ValueError as exc:
        return AIResponse(success=False, message=str(exc))

    if not resume_text.strip():
        return AIResponse(success=False, message="No text could be extracted from the PDF.")

    # Hydrate job details from DB when job_id is provided
    jt = job_title.strip()
    jd = ""
    skills_list = [s.strip() for s in required_skills.split(",") if s.strip()]

    if job_id.strip():
        try:
            db = SessionLocal()
            job = db.query(JobPosting).filter(JobPosting.job_id == int(job_id)).first()
            db.close()
            if job:
                jt = jt or (job.title or "")
                jd = job.description or ""
                if not skills_list and job.skills_required:
                    raw_skills = job.skills_required
                    skills_list = (
                        [s.strip() for s in raw_skills.split(",") if s.strip()]
                        if isinstance(raw_skills, str)
                        else list(raw_skills or [])
                    )
        except Exception:
            pass  # Proceed without DB data if lookup fails

    if not jt:
        return AIResponse(success=False, message="Provide a job_title or a valid job_id.")

    result = await coach_resume_with_llm(
        member_headline=headline.strip(),
        resume_text=resume_text,
        job_title=jt,
        job_description=jd,
        required_skills=skills_list,
    )

    data = result.get("data", {})
    data["extracted_text_preview"] = resume_text[:300]
    return AIResponse(
        success=result["success"],
        message=f"Career coaching complete from PDF (method: {result['method']})",
        data=data,
    )

# ─── PDF Helpers ──────────────────────────────────────────────────────────────
@router.post("/tasks/list", response_model=AIResponse, summary="List all AI tasks")
async def list_tasks():
    """List all active and recent AI tasks from MongoDB."""
    from database import mongo_db
    from datetime import datetime, timezone, timedelta
    tasks = []
    # Fetch last 50 tasks from MongoDB sorted by created_at
    cursor = mongo_db.agent_tasks.find(
        {},
        {"task_id": 1, "job_id": 1, "status": 1, "created_at": 1, "_id": 0}
    ).sort("created_at", -1).limit(50)
    async for doc in cursor:
        tasks.append(doc)
    return AIResponse(success=True, message=f"Found {len(tasks)} tasks", data=tasks)


@router.get("/queue-status", response_model=AIResponse, summary="AI dispatcher queue depth and concurrency")
async def queue_status(current_user: TokenPayload = Depends(require_recruiter)):
    """
    Return real-time dispatcher stats: how many workflows are running,
    how many are queued, and how many concurrent slots are available.
    Useful for monitoring and demo observability.
    """
    stats = get_queue_stats()
    return AIResponse(
        success=True,
        message=(
            f"{stats['active']}/{stats['max_concurrent']} workflows active, "
            f"{stats['queued']} queued"
        ),
        data=stats,
    )


# ─── WebSocket for Real-time Updates ───────────────────────────

@router.websocket("/ws/{task_id}")
async def websocket_task_updates(websocket: WebSocket, task_id: str):
    """WebSocket endpoint to stream real-time AI task updates to the UI."""
    await websocket.accept()

    if task_id not in ws_connections:
        ws_connections[task_id] = []
    ws_connections[task_id].append(websocket)

    try:
        # Send current status immediately (reads from MongoDB if not in memory cache)
        status = await get_task_status(task_id)
        if status:
            await websocket.send_json(status)

        # Keep connection open until task completes or client disconnects
        while True:
            data = await websocket.receive_text()
            # Client can send "ping" to keep alive
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        if task_id in ws_connections and websocket in ws_connections[task_id]:
            ws_connections[task_id].remove(websocket)


# ─── Career Coach Agent ─────────────────────────────────────────────────────

class CareerCoachRequest(BaseModel):
    member_id: Optional[int] = Field(None, description="Member ID to fetch profile from DB (optional)")
    headline: str = Field("", description="Current LinkedIn headline")
    resume_text: str = Field("", description="Current resume text")
    job_id: Optional[int] = Field(None, description="Target job posting ID (optional)")
    job_title: str = Field("", description="Target job title")
    job_description: str = Field("", description="Target job description")
    required_skills: list = Field(default_factory=list, description="Required skills for the target role")

    model_config = {
        "json_schema_extra": {
            "examples": [{
                "headline": "Software Engineer at Acme Corp",
                "resume_text": "5 years Python, built REST APIs, led team of 4",
                "job_title": "Senior Backend Engineer",
                "required_skills": ["Python", "Kafka", "Kubernetes"]
            }]
        }
    }


@router.post("/career-coach", response_model=AIResponse, summary="Career Coach — resume & profile advisor")
async def career_coach(req: CareerCoachRequest):
    """
    Career Coach Agent: analyzes a member's current profile against a target job
    and returns specific, actionable improvement suggestions.

    Can fetch member profile from DB if member_id is provided.
    Can fetch job details from DB if job_id is provided.
    All fields can also be passed directly in the request body.
    """
    from agents.career_coach import coach_resume_with_llm
    from database import SessionLocal
    from models.member import Member
    from models.job import JobPosting

    headline = req.headline
    resume_text = req.resume_text
    job_title = req.job_title
    job_description = req.job_description
    required_skills = req.required_skills

    db = SessionLocal()
    try:
        # Optionally hydrate member from DB
        if req.member_id:
            member = db.query(Member).filter(Member.member_id == req.member_id).first()
            if member:
                headline = headline or member.headline or ""
                resume_text = resume_text or member.resume_text or member.about or ""

        # Optionally hydrate job from DB
        if req.job_id:
            job = db.query(JobPosting).filter(JobPosting.job_id == req.job_id).first()
            if job:
                job_title = job_title or job.title or ""
                job_description = job_description or job.description or ""
                if not required_skills and job.skills_required:
                    skills = job.skills_required
                    if isinstance(skills, str):
                        required_skills = [s.strip() for s in skills.split(",") if s.strip()]
                    elif isinstance(skills, list):
                        required_skills = skills
    finally:
        db.close()

    if not resume_text and not headline:
        return AIResponse(success=False, message="Provide resume_text/headline or a valid member_id")
    if not job_title:
        return AIResponse(success=False, message="Provide job_title or a valid job_id")

    result = await coach_resume_with_llm(
        member_headline=headline,
        resume_text=resume_text,
        job_title=job_title,
        job_description=job_description,
        required_skills=required_skills,
    )

    return AIResponse(
        success=result["success"],
        message=f"Career coaching complete (method: {result['method']})",
        data=result.get("data", {}),
    )


# ─── Metrics Endpoint ────────────────────────────────────────────────────────

@router.get("/metrics", response_model=AIResponse, summary="AI workflow evaluation metrics")
async def get_metrics():
    """
    Evaluation metrics for the AI hiring workflow.
    Reports:
    - Total tasks run
    - Human-in-the-loop approval rate
    - Average shortlist match score
    - Task status distribution
    """
    from database import mongo_db

    total = await mongo_db.agent_tasks.count_documents({})
    approved = await mongo_db.agent_tasks.count_documents({"status": "approved"})
    rejected = await mongo_db.agent_tasks.count_documents({"status": "rejected"})
    failed = await mongo_db.agent_tasks.count_documents({"status": "failed"})
    awaiting = await mongo_db.agent_tasks.count_documents({"status": "awaiting_approval"})

    reviewed = approved + rejected
    approval_rate = round(approved / reviewed, 3) if reviewed > 0 else None

    # Compute average shortlist match score across all completed tasks
    scores = []
    cursor = mongo_db.agent_tasks.find(
        {"result.shortlist": {"$exists": True, "$ne": []}},
        {"result.shortlist": 1, "_id": 0}
    ).limit(100)
    async for doc in cursor:
        shortlist = doc.get("result", {}).get("shortlist", [])
        for entry in shortlist:
            s = entry.get("overall_score")
            if s is not None:
                scores.append(s)

    avg_match_score = round(sum(scores) / len(scores), 3) if scores else None

    metrics = {
        "total_tasks": total,
        "status_breakdown": {
            "approved": approved,
            "rejected": rejected,
            "awaiting_approval": awaiting,
            "failed": failed,
        },
        "human_in_the_loop": {
            "total_reviewed": reviewed,
            "approval_rate": approval_rate,
            "approval_rate_pct": f"{approval_rate * 100:.1f}%" if approval_rate is not None else "N/A",
        },
        "match_quality": {
            "candidates_scored": len(scores),
            "avg_match_score": avg_match_score,
            "avg_match_score_pct": f"{avg_match_score * 100:.1f}%" if avg_match_score is not None else "N/A",
        },
    }

    return AIResponse(success=True, message="Metrics computed", data=metrics)


# ─── Candidate Decision ─────────────────────────────────────────

@router.post("/candidate-decision", response_model=AIResponse, summary="Move candidate to interview / selected / rejected")
async def candidate_decision(
    req: CandidateDecisionRequest,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(require_recruiter),
):
    """
    Update the hiring pipeline stage for a shortlisted candidate.
    Looks up the application by member_id + job_id and updates its status.

    Decision mapping:
      interview -> application status: interview
      selected  -> application status: offer
      rejected  -> application status: rejected
    """
    DECISION_MAP = {"interview": "interview", "selected": "offer", "rejected": "rejected"}
    status = DECISION_MAP.get(req.decision)
    if not status:
        return AIResponse(success=False, message=f"Invalid decision '{req.decision}'. Use: interview, selected, rejected")

    app = db.query(Application).filter(
        Application.member_id == req.candidate_id,
        Application.job_id == req.job_id,
    ).first()

    if not app:
        return AIResponse(
            success=True,
            message=f"No application on file for candidate {req.candidate_id} / job {req.job_id}. Decision noted.",
            data={"candidate_id": req.candidate_id, "job_id": req.job_id, "decision": req.decision, "persisted": False},
        )

    old_status = app.status
    app.status = status
    db.commit()
    db.refresh(app)

    return AIResponse(
        success=True,
        message=f"Candidate {req.candidate_id} moved to '{req.decision}' (app {app.application_id}: {old_status} -> {status})",
        data={"application_id": app.application_id, "candidate_id": req.candidate_id, "decision": req.decision, "new_status": status, "persisted": True},
    )
