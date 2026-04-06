"""
AI Service Router — REST + WebSocket endpoints for Agentic AI workflows.
"""

import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any

from agents.hiring_assistant import start_task, get_task_status, approve_task, ws_connections, active_tasks
from agents.resume_parser import parse_resume_with_ollama
from agents.job_matcher import match_candidate_to_job

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


# ─── Endpoints ──────────────────────────────────────────────────

@router.post("/analyze-candidates", response_model=AIResponse, summary="Start candidate analysis workflow")
async def analyze_candidates(req: AnalyzeCandidatesRequest):
    """
    Start the Hiring Assistant multi-step AI workflow:
    1. Parse resumes for all candidates
    2. Match candidates against job requirements
    3. Rank and shortlist top N candidates
    4. Generate personalized outreach drafts
    
    Returns a task_id to track progress via /ai/task-status or WebSocket.
    """
    task_id = await start_task(req.job_id, req.top_n)
    return AIResponse(
        success=True,
        message=f"AI analysis started. Use task_id to track progress.",
        data={"task_id": task_id, "job_id": req.job_id},
    )


@router.post("/task-status", response_model=AIResponse, summary="Get AI task status")
async def task_status(req: TaskStatusRequest):
    """Check the current status and progress of an AI task.
    Falls back to MongoDB so tasks are queryable after a server restart."""
    status = await get_task_status(req.task_id)
    if not status:
        return AIResponse(success=False, message=f"Task {req.task_id} not found")

    return AIResponse(success=True, message=f"Task status: {status['status']}", data=status)


@router.post("/approve", response_model=AIResponse, summary="Approve or reject AI output")
async def approve_output(req: ApproveRequest):
    """
    Human-in-the-loop: approve or reject the AI-generated shortlist and outreach drafts.
    The recruiter must review the AI output before any action is taken.
    """
    result = await approve_task(req.task_id, req.approved, req.feedback)
    return AIResponse(**result)


@router.post("/parse-resume", response_model=AIResponse, summary="Parse a resume (standalone skill)")
async def parse_resume(req: ParseResumeRequest):
    """
    Standalone resume parsing endpoint. Uses Ollama LLM with regex fallback.
    Extracts: skills, experience, education, contact info, summary.
    """
    result = await parse_resume_with_ollama(req.resume_text)
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


@router.post("/tasks/list", response_model=AIResponse, summary="List all AI tasks")
async def list_tasks():
    """List all active and recent AI tasks."""
    tasks = [
        {
            "task_id": t["task_id"],
            "job_id": t.get("job_id"),
            "status": t["status"],
            "created_at": t.get("created_at"),
        }
        for t in active_tasks.values()
    ]
    return AIResponse(success=True, message=f"Found {len(tasks)} tasks", data=tasks)


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
