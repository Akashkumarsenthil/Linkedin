"""
Hiring Assistant Agent (Supervisor)
Orchestrates the multi-step AI workflow:
  1. Parse resumes for candidates
  2. Match candidates against job requirements
  3. Generate outreach drafts for top matches
  4. Wait for human approval before finalizing

Publishes intermediate results to Kafka ai.results topic.

Persistence model
-----------------
MongoDB ``agent_tasks`` is the source of truth.
``active_tasks`` is an in-process cache populated:
  - immediately when a task is created (start_task)
  - on every status transition (update_task_status)
  - at startup via rehydrate_tasks() for recoverable tasks

Recoverable statuses: "awaiting_approval"
  → loaded back into active_tasks so approval continues to work.

Non-recoverable statuses when found on startup: "queued", "running"
  → workflow was interrupted mid-flight; marked "interrupted" in MongoDB
    and NOT loaded into active_tasks (can't resume without re-running).

Terminal statuses: "approved", "rejected", "completed", "failed", "interrupted"
  → kept in MongoDB for audit; not reloaded into active_tasks.
"""

import uuid
import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

from database import SessionLocal, mongo_db
from models.job import JobPosting
from models.application import Application
from models.member import Member
from agents.resume_parser import parse_resume_with_ollama
from agents.job_matcher import match_candidate_to_job
from agents.outreach_generator import generate_outreach_with_ollama
from kafka_producer import kafka_producer

logger = logging.getLogger(__name__)

# ── Runtime cache ────────────────────────────────────────────────────────────
# MongoDB is the source of truth. This dict is an in-process cache only.
# Do NOT read from it without first trying MongoDB when a task_id is not found.
active_tasks: Dict[str, Dict[str, Any]] = {}

# WebSocket connections are per-process and cannot survive a restart.
ws_connections: Dict[str, list] = {}

# Statuses that mean the workflow is still ongoing / waiting for input.
_RECOVERABLE_STATUSES = {"awaiting_approval"}
_INTERRUPTED_ON_RESTART = {"queued", "running"}


# ── Helpers ──────────────────────────────────────────────────────────────────

def _strip_mongo_id(doc: dict) -> dict:
    """Remove the MongoDB ObjectId so the dict is JSON-serialisable."""
    doc.pop("_id", None)
    return doc


async def _load_task_from_mongo(task_id: str) -> Optional[Dict[str, Any]]:
    """Fetch a single task document from MongoDB. Returns None if not found."""
    doc = await mongo_db.agent_tasks.find_one({"task_id": task_id})
    if doc is None:
        return None
    return _strip_mongo_id(doc)


# ── Core state machine ───────────────────────────────────────────────────────

async def update_task_status(
    task_id: str, status: str, step: str, data: Any = None, progress: int = 0
):
    """Update task status in MongoDB (source of truth), memory cache, WebSocket clients, and Kafka."""
    now = datetime.now(timezone.utc).isoformat()
    step_entry = {"step": step, "status": status, "timestamp": now}

    mongo_update: Dict[str, Any] = {
        "status": status,
        "current_step": step,
        "progress": progress,
        "updated_at": now,
    }
    if data is not None:
        mongo_update["step_data"] = data

    # 1. Persist to MongoDB first (source of truth)
    await mongo_db.agent_tasks.update_one(
        {"task_id": task_id},
        {
            "$set": mongo_update,
            "$push": {"steps": step_entry},
        },
        upsert=True,
    )

    # 2. Mirror into memory cache
    if task_id in active_tasks:
        active_tasks[task_id].update(mongo_update)
        active_tasks[task_id].setdefault("steps", []).append(step_entry)

    # 3. Notify any connected WebSocket clients
    if task_id in ws_connections:
        message = {"task_id": task_id, **mongo_update}
        dead = []
        for ws in ws_connections[task_id]:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            ws_connections[task_id].remove(ws)

    # 4. Publish to Kafka (best-effort)
    try:
        await kafka_producer.publish(
            topic="ai.results",
            event_type="ai.step_completed",
            actor_id="hiring_assistant",
            entity_type="ai_task",
            entity_id=task_id,
            payload={"step": step, "status": status, "progress": progress},
            trace_id=task_id,
        )
    except Exception:
        pass


# ── Workflow ─────────────────────────────────────────────────────────────────

async def run_hiring_workflow(task_id: str, job_id: int, top_n: int = 5):
    """
    Main hiring assistant workflow:
    1. Fetch job posting and candidates
    2. Parse resumes
    3. Match candidates to job
    4. Rank and shortlist top N
    5. Generate outreach drafts
    6. Wait for recruiter approval
    """
    db = SessionLocal()

    try:
        # ── Step 1: Fetch job and candidates ────────────────────────
        await update_task_status(task_id, "running", "fetch_data", progress=10)

        job = db.query(JobPosting).filter(JobPosting.job_id == job_id).first()
        if not job:
            await update_task_status(task_id, "failed", "fetch_data", data={"error": "Job not found"})
            return

        applications = db.query(Application).filter(Application.job_id == job_id).all()
        if not applications:
            members = db.query(Member).limit(50).all()
        else:
            member_ids = [app.member_id for app in applications]
            members = db.query(Member).filter(Member.member_id.in_(member_ids)).all()

        if not members:
            await update_task_status(
                task_id, "failed", "fetch_data",
                data={"error": "No candidates found"},
            )
            return

        job_data = job.to_dict()
        await update_task_status(
            task_id, "running", "fetch_data",
            data={"job_title": job.title, "candidates_found": len(members)},
            progress=20,
        )

        # ── Step 2: Parse resumes ────────────────────────────────────
        await update_task_status(task_id, "running", "parse_resumes", progress=30)

        parsed_resumes = {}
        for member in members:
            resume_text = member.resume_text or member.about or ""
            if resume_text:
                parsed = await parse_resume_with_ollama(resume_text)
                parsed_resumes[member.member_id] = parsed

            await mongo_db.agent_traces.insert_one({
                "task_id": task_id,
                "step": "resume_parser",
                "member_id": member.member_id,
                "result": parsed_resumes.get(member.member_id, {}),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

        await update_task_status(
            task_id, "running", "parse_resumes",
            data={"resumes_parsed": len(parsed_resumes)},
            progress=50,
        )

        # ── Step 3: Match candidates ────────────────────────────────
        await update_task_status(task_id, "running", "match_candidates", progress=60)

        match_results = []
        for member in members:
            candidate_data = member.to_dict()
            parsed = parsed_resumes.get(member.member_id)
            match = await match_candidate_to_job(job_data, candidate_data, parsed)
            match_results.append(match)

            await mongo_db.agent_traces.insert_one({
                "task_id": task_id,
                "step": "job_matcher",
                "member_id": member.member_id,
                "match_score": match["overall_score"],
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

        match_results.sort(key=lambda x: x["overall_score"], reverse=True)
        shortlist = match_results[:top_n]

        await update_task_status(
            task_id, "running", "match_candidates",
            data={
                "total_matched": len(match_results),
                "shortlist_count": len(shortlist),
                "top_score": shortlist[0]["overall_score"] if shortlist else 0,
            },
            progress=75,
        )

        # ── Step 4: Generate outreach drafts ─────────────────────────
        await update_task_status(task_id, "running", "generate_outreach", progress=85)

        outreach_drafts = []
        for match in shortlist:
            candidate_id = match["candidate_id"]
            member = db.query(Member).filter(Member.member_id == candidate_id).first()
            if member:
                outreach = await generate_outreach_with_ollama(
                    job_data, member.to_dict(), match
                )
                outreach["match_score"] = match["overall_score"]
                outreach["recommendation"] = match["recommendation"]
                outreach_drafts.append(outreach)

        await update_task_status(
            task_id, "running", "generate_outreach",
            data={"drafts_generated": len(outreach_drafts)},
            progress=90,
        )

        # ── Step 5: Persist final result, then await approval ────────
        final_result = {
            "job": {"job_id": job_id, "title": job.title},
            "shortlist": shortlist,
            "outreach_drafts": outreach_drafts,
            "total_candidates_analyzed": len(members),
        }

        # Persist result to MongoDB top-level BEFORE changing status.
        # This ensures the result survives a restart even if the process
        # dies between this write and the status update below.
        await mongo_db.agent_tasks.update_one(
            {"task_id": task_id},
            {"$set": {"result": final_result}},
        )

        # Mirror into memory cache
        if task_id in active_tasks:
            active_tasks[task_id]["result"] = final_result

        await update_task_status(
            task_id, "awaiting_approval", "complete",
            data=final_result,
            progress=100,
        )

        # Publish final event to Kafka (best-effort)
        try:
            await kafka_producer.publish(
                topic="ai.results",
                event_type="ai.completed",
                actor_id="hiring_assistant",
                entity_type="ai_task",
                entity_id=task_id,
                payload={
                    "job_id": job_id,
                    "shortlist_count": len(shortlist),
                    "status": "awaiting_approval",
                },
                trace_id=task_id,
            )
        except Exception:
            pass

    except Exception as e:
        logger.error(f"Hiring workflow failed for task {task_id}: {e}", exc_info=True)
        await update_task_status(
            task_id, "failed", "error",
            data={"error": str(e)},
        )
    finally:
        db.close()


# ── Public API ───────────────────────────────────────────────────────────────

async def start_task(job_id: int, top_n: int = 5) -> str:
    """
    Create a new hiring assistant task.

    Persists the task document to MongoDB synchronously before starting the
    background coroutine, so the task is always queryable even if the workflow
    hasn't executed a single step yet.
    """
    task_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    task_doc: Dict[str, Any] = {
        "task_id": task_id,
        "job_id": job_id,
        "top_n": top_n,
        "status": "queued",
        "created_at": now,
        "updated_at": now,
        "steps": [],
    }

    # Write to MongoDB BEFORE anything else so the task is always queryable.
    # Use a copy to avoid motor mutating task_doc with the _id field.
    await mongo_db.agent_tasks.insert_one({**task_doc})

    # Cache in memory
    active_tasks[task_id] = task_doc

    # Publish to Kafka (best-effort)
    try:
        await kafka_producer.publish(
            topic="ai.requests",
            event_type="ai.requested",
            actor_id="recruiter",
            entity_type="ai_task",
            entity_id=task_id,
            payload={"job_id": job_id, "top_n": top_n},
            trace_id=task_id,
        )
    except Exception:
        pass

    # Fire-and-forget background workflow
    asyncio.create_task(run_hiring_workflow(task_id, job_id, top_n))

    return task_id


async def get_task_status(task_id: str) -> Optional[Dict[str, Any]]:
    """
    Return the current task state.

    Checks the in-memory cache first (fast path). Falls back to MongoDB so
    that tasks survive server restarts and are still queryable after eviction
    from the cache.
    """
    if task_id in active_tasks:
        return active_tasks[task_id]

    # Cache miss — try MongoDB
    doc = await _load_task_from_mongo(task_id)
    if doc is not None:
        # Warm the cache so subsequent calls are fast
        active_tasks[task_id] = doc
    return doc


async def approve_task(task_id: str, approved: bool, feedback: str = "") -> Dict[str, Any]:
    """
    Human-in-the-loop: approve or reject the AI-generated output.

    Works correctly after a server restart because it falls back to MongoDB
    when the task is not in the in-memory cache.
    """
    task = active_tasks.get(task_id)

    if task is None:
        # Try to recover from MongoDB (covers post-restart scenario)
        task = await _load_task_from_mongo(task_id)
        if task is None:
            return {"success": False, "message": f"Task {task_id} not found"}
        # Warm cache for this task
        active_tasks[task_id] = task

    if task["status"] != "awaiting_approval":
        return {
            "success": False,
            "message": f"Task is in '{task['status']}' state, not awaiting approval",
        }

    new_status = "approved" if approved else "rejected"
    task["status"] = new_status
    task["approval_feedback"] = feedback

    await update_task_status(
        task_id, new_status, "approval",
        data={"approved": approved, "feedback": feedback},
    )

    return {"success": True, "message": f"Task {new_status}", "task_id": task_id}


async def rehydrate_tasks() -> int:
    """
    Reload recoverable task state from MongoDB into the in-memory cache.

    Called once during application startup (see main.py lifespan).

    Rules
    -----
    - ``awaiting_approval``: workflow finished, result is in MongoDB, recruiter
      hasn't approved yet.  Load into active_tasks so /ai/approve keeps working.
    - ``queued`` / ``running``: workflow was in-flight when the process died.
      Cannot be resumed.  Mark as ``interrupted`` in MongoDB so the status
      is honest; do NOT load into active_tasks.

    Returns the number of tasks loaded into active_tasks (awaiting_approval only).
    """
    loaded = 0
    interrupted = 0
    now = datetime.now(timezone.utc).isoformat()

    try:
        recoverable = list(_RECOVERABLE_STATUSES) + list(_INTERRUPTED_ON_RESTART)
        cursor = mongo_db.agent_tasks.find({"status": {"$in": recoverable}})

        async for doc in cursor:
            _strip_mongo_id(doc)
            task_id = doc.get("task_id")
            status = doc.get("status")

            if not task_id or not status:
                continue

            if status in _RECOVERABLE_STATUSES:
                # Load into cache — approval / status queries will work
                active_tasks[task_id] = doc
                loaded += 1
                logger.info(f"  [rehydrate] restored task {task_id} (status={status})")

            elif status in _INTERRUPTED_ON_RESTART:
                # Workflow was mid-flight; mark honestly so clients don't get stuck
                await mongo_db.agent_tasks.update_one(
                    {"task_id": task_id},
                    {"$set": {
                        "status": "interrupted",
                        "updated_at": now,
                        "interrupted_reason": "Server restarted while task was in-flight",
                    }},
                )
                interrupted += 1
                logger.info(f"  [rehydrate] marked task {task_id} as interrupted (was {status})")

    except Exception as e:
        logger.error(f"Task rehydration failed: {e}", exc_info=True)

    logger.info(
        f"  [rehydrate] done — {loaded} task(s) restored, {interrupted} marked interrupted"
    )
    return loaded
