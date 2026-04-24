"""
AI Evaluation Script — Matching Quality & Human-in-the-Loop Metrics

Produces two evaluation reports:
  1. Matching Quality — runs the job matcher on sampled job+candidate pairs from
     seeded data and measures shortlist relevance using a skills-overlap rubric.
  2. HITL Effectiveness — queries MongoDB agent_tasks for approval outcomes and
     computes approval rate, feedback categories, and response times.

Run from backend/:
    python scripts/ai_evaluation.py              # both evaluations
    python scripts/ai_evaluation.py --matching    # matching quality only
    python scripts/ai_evaluation.py --hitl        # HITL only
    python scripts/ai_evaluation.py --json        # output as JSON

Matching quality uses ONLY the deterministic scoring algorithm in
agents/job_matcher.py (no Ollama needed). The rubric evaluates whether
the top-K shortlist places candidates with genuine skills overlap above
candidates without it — a necessary property for a useful ranking.

HITL effectiveness queries real MongoDB state from completed workflows.
If no tasks have been run yet, it prints zeros and explains how to
generate data.
"""

import sys
import json
import asyncio
import argparse
import random
import statistics
from pathlib import Path
from datetime import datetime, timezone
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database import SessionLocal, mongo_db, mongo_client
from models.job import JobPosting
from models.member import Member
from agents.job_matcher import match_candidate_to_job

random.seed(42)


# ── Matching Quality Evaluation ────────────────────────────────────────────────

async def evaluate_matching_quality(sample_jobs: int = 10, candidates_per_job: int = 20, top_k: int = 5) -> dict:
    """
    Rubric-based evaluation of matching quality.

    Methodology:
      For each sampled job, select a pool of candidates. Run the matcher on all
      pairs. Take the top-K shortlist. Measure:
        - Precision@K: fraction of top-K candidates whose skills overlap with
          the job is above a minimum threshold (>=1 matching skill = "relevant").
        - NDCG@K: normalised discounted cumulative gain, treating the actual
          skills_overlap_ratio as the relevance grade.
        - Mean reciprocal rank of the first candidate with >=50% skills overlap.
        - Score distribution statistics (min, median, max, stdev).

    All scores come from the deterministic algorithm in job_matcher.py —
    no LLM is involved, so results are fully reproducible.
    """
    db = SessionLocal()
    try:
        jobs = db.query(JobPosting).filter(
            JobPosting.status == "open",
            JobPosting.skills_required.isnot(None),
        ).limit(sample_jobs * 3).all()

        if not jobs:
            return {"error": "No open jobs with skills_required found. Run seed_data.py first."}

        # Pick jobs that actually have skills lists
        valid_jobs = []
        for j in jobs:
            skills = j.skills_required if isinstance(j.skills_required, list) else []
            if len(skills) >= 2:
                valid_jobs.append(j)
        valid_jobs = valid_jobs[:sample_jobs]

        if not valid_jobs:
            return {"error": "No jobs with >=2 skills_required. Run seed_data.py first."}

        total_members = db.query(Member).count()
        if total_members == 0:
            return {"error": "No members found. Run seed_data.py first."}

        # Collect per-job results
        job_results = []
        all_top_k_scores = []
        all_precisions = []
        all_ndcgs = []
        all_mrrs = []

        for job in valid_jobs:
            job_data = job.to_dict()
            job_skills = set(s.lower() for s in (job_data.get("skills_required") or []))

            # Sample candidates
            offset = random.randint(0, max(0, total_members - candidates_per_job))
            members = db.query(Member).offset(offset).limit(candidates_per_job).all()

            # Run matcher
            match_results = []
            for member in members:
                candidate_data = member.to_dict()
                match = await match_candidate_to_job(job_data, candidate_data)
                # Compute ground-truth skills overlap for rubric
                member_skills = set(s.lower() for s in (candidate_data.get("skills") or []))
                overlap_count = len(job_skills & member_skills)
                overlap_ratio = overlap_count / len(job_skills) if job_skills else 0
                match["_overlap_count"] = overlap_count
                match["_overlap_ratio"] = overlap_ratio
                match_results.append(match)

            match_results.sort(key=lambda x: x["overall_score"], reverse=True)
            shortlist = match_results[:top_k]
            all_pool = match_results

            # ── Precision@K: "relevant" = has at least 1 matching skill
            relevant_in_top_k = sum(1 for m in shortlist if m["_overlap_count"] >= 1)
            precision = relevant_in_top_k / top_k if top_k > 0 else 0
            all_precisions.append(precision)

            # ── NDCG@K: using overlap_ratio as relevance grade
            dcg = sum(
                m["_overlap_ratio"] / (1 + __import__("math").log2(i + 2))
                for i, m in enumerate(shortlist)
            )
            # Ideal: sort entire pool by overlap_ratio desc, take top-K
            ideal_sorted = sorted(all_pool, key=lambda x: x["_overlap_ratio"], reverse=True)[:top_k]
            idcg = sum(
                m["_overlap_ratio"] / (1 + __import__("math").log2(i + 2))
                for i, m in enumerate(ideal_sorted)
            )
            ndcg = dcg / idcg if idcg > 0 else 0
            all_ndcgs.append(ndcg)

            # ── MRR: rank of first candidate with >=50% overlap
            mrr = 0.0
            for i, m in enumerate(shortlist):
                if m["_overlap_ratio"] >= 0.5:
                    mrr = 1.0 / (i + 1)
                    break
            all_mrrs.append(mrr)

            top_k_scores = [m["overall_score"] for m in shortlist]
            all_top_k_scores.extend(top_k_scores)

            job_results.append({
                "job_id": job.job_id,
                "title": job.title[:60],
                "required_skills_count": len(job_skills),
                "candidates_evaluated": len(all_pool),
                "top_k_scores": [round(s, 3) for s in top_k_scores],
                "precision_at_k": round(precision, 3),
                "ndcg_at_k": round(ndcg, 3),
                "mrr": round(mrr, 3),
            })

        return {
            "methodology": "Rubric-based evaluation of top-K shortlist quality using skills overlap as ground truth",
            "parameters": {
                "sample_jobs": len(valid_jobs),
                "candidates_per_job": candidates_per_job,
                "top_k": top_k,
            },
            "aggregate_results": {
                "mean_precision_at_k": round(statistics.mean(all_precisions), 3),
                "mean_ndcg_at_k": round(statistics.mean(all_ndcgs), 3),
                "mean_mrr": round(statistics.mean(all_mrrs), 3),
                "top_k_score_stats": {
                    "min": round(min(all_top_k_scores), 3) if all_top_k_scores else 0,
                    "median": round(statistics.median(all_top_k_scores), 3) if all_top_k_scores else 0,
                    "max": round(max(all_top_k_scores), 3) if all_top_k_scores else 0,
                    "stdev": round(statistics.stdev(all_top_k_scores), 3) if len(all_top_k_scores) > 1 else 0,
                },
            },
            "per_job_results": job_results,
        }
    finally:
        db.close()


# ── Human-in-the-Loop Effectiveness ────────────────────────────────────────────

async def evaluate_hitl_effectiveness() -> dict:
    """
    Query MongoDB agent_tasks for approval/rejection outcomes.

    Metrics:
      - Total tasks by status (approved, rejected, awaiting_approval, failed, etc.)
      - Approval rate: approved / (approved + rejected)
      - Feedback analysis: categorise feedback text as
          "approved-as-is" (approved, empty feedback),
          "approved-with-feedback" (approved, non-empty feedback),
          "rejected" (rejected, any feedback).
      - Time-to-decision: elapsed time from awaiting_approval to approved/rejected.
      - Shortlist quality by outcome: mean top match score for approved vs rejected.
    """
    try:
        all_tasks = await mongo_db.agent_tasks.find({}).to_list(length=1000)
    except Exception as e:
        return {"error": f"MongoDB query failed: {e}. Is MongoDB running?"}

    if not all_tasks:
        return {
            "error": "No AI tasks found in MongoDB. Run at least one workflow first.",
            "how_to_generate": (
                "1. Start the backend: uvicorn main:app --reload\n"
                "2. POST /ai/analyze-candidates with {\"job_id\": 1, \"top_n\": 5}\n"
                "3. Wait for status to reach 'awaiting_approval'\n"
                "4. POST /ai/approve with {\"task_id\": \"...\", \"approved\": true, \"feedback\": \"...\"}\n"
                "5. Re-run this script."
            ),
        }

    status_counts: dict[str, int] = {}
    approved_tasks = []
    rejected_tasks = []
    feedback_categories = {"approved_as_is": 0, "approved_with_feedback": 0, "rejected": 0}
    decision_times = []
    approved_top_scores = []
    rejected_top_scores = []

    for task in all_tasks:
        status = task.get("status", "unknown")
        status_counts[status] = status_counts.get(status, 0) + 1

        if status == "approved":
            approved_tasks.append(task)
            fb = task.get("approval_feedback", "")
            if fb and fb.strip():
                feedback_categories["approved_with_feedback"] += 1
            else:
                feedback_categories["approved_as_is"] += 1

        elif status == "rejected":
            rejected_tasks.append(task)
            feedback_categories["rejected"] += 1

        # Time-to-decision from steps audit trail
        if status in ("approved", "rejected"):
            steps = task.get("steps", [])
            await_time = None
            decision_time = None
            for s in steps:
                if s.get("status") == "awaiting_approval":
                    await_time = s.get("timestamp")
                if s.get("step") == "approval":
                    decision_time = s.get("timestamp")
            if await_time and decision_time:
                try:
                    t0 = datetime.fromisoformat(await_time.replace("Z", "+00:00"))
                    t1 = datetime.fromisoformat(decision_time.replace("Z", "+00:00"))
                    decision_times.append((t1 - t0).total_seconds())
                except Exception:
                    pass

        # Extract top match score from result
        result = task.get("result")
        if result and isinstance(result, dict):
            shortlist = result.get("shortlist", [])
            if shortlist:
                top_score = max(m.get("overall_score", 0) for m in shortlist)
                if status == "approved":
                    approved_top_scores.append(top_score)
                elif status == "rejected":
                    rejected_top_scores.append(top_score)

    total_decided = len(approved_tasks) + len(rejected_tasks)
    approval_rate = len(approved_tasks) / total_decided if total_decided > 0 else None

    return {
        "methodology": "Query MongoDB agent_tasks for approval/rejection outcomes and compute rates",
        "total_tasks": len(all_tasks),
        "status_distribution": status_counts,
        "approval_rate": round(approval_rate, 3) if approval_rate is not None else "N/A (no decisions recorded)",
        "feedback_categories": feedback_categories,
        "total_decided": total_decided,
        "decision_time_stats": {
            "count": len(decision_times),
            "mean_seconds": round(statistics.mean(decision_times), 1) if decision_times else "N/A",
            "min_seconds": round(min(decision_times), 1) if decision_times else "N/A",
            "max_seconds": round(max(decision_times), 1) if decision_times else "N/A",
        },
        "shortlist_quality_by_outcome": {
            "approved_mean_top_score": round(statistics.mean(approved_top_scores), 3) if approved_top_scores else "N/A",
            "rejected_mean_top_score": round(statistics.mean(rejected_top_scores), 3) if rejected_top_scores else "N/A",
        },
    }


# ── Main ───────────────────────────────────────────────────────────────────────

def _print_matching(results: dict) -> None:
    if "error" in results:
        print(f"  ERROR: {results['error']}")
        return

    agg = results["aggregate_results"]
    print(f"  Sample: {results['parameters']['sample_jobs']} jobs x "
          f"{results['parameters']['candidates_per_job']} candidates, top-{results['parameters']['top_k']}")
    print()
    print(f"  Precision@{results['parameters']['top_k']}:  {agg['mean_precision_at_k']:.3f}")
    print(f"  NDCG@{results['parameters']['top_k']}:       {agg['mean_ndcg_at_k']:.3f}")
    print(f"  MRR:           {agg['mean_mrr']:.3f}")
    print()
    ss = agg["top_k_score_stats"]
    print(f"  Top-K score distribution:  min={ss['min']:.3f}  median={ss['median']:.3f}  "
          f"max={ss['max']:.3f}  stdev={ss['stdev']:.3f}")
    print()
    print(f"  Per-job breakdown:")
    for jr in results["per_job_results"]:
        scores_str = ", ".join(f"{s:.2f}" for s in jr["top_k_scores"])
        print(f"    Job {jr['job_id']:>4}: P@K={jr['precision_at_k']:.2f}  "
              f"NDCG={jr['ndcg_at_k']:.2f}  MRR={jr['mrr']:.2f}  "
              f"scores=[{scores_str}]  — {jr['title']}")


def _print_hitl(results: dict) -> None:
    if "error" in results:
        print(f"  {results['error']}")
        if "how_to_generate" in results:
            print(f"\n  How to generate data:\n  {results['how_to_generate']}")
        return

    print(f"  Total tasks in MongoDB: {results['total_tasks']}")
    print(f"  Status distribution: {results['status_distribution']}")
    print(f"  Approval rate: {results['approval_rate']}")
    print(f"  Feedback categories: {results['feedback_categories']}")
    dt = results["decision_time_stats"]
    print(f"  Decision time: count={dt['count']}, mean={dt['mean_seconds']}s, "
          f"min={dt['min_seconds']}s, max={dt['max_seconds']}s")
    sq = results["shortlist_quality_by_outcome"]
    print(f"  Shortlist quality — approved avg top score: {sq['approved_mean_top_score']}, "
          f"rejected: {sq['rejected_mean_top_score']}")


async def main():
    parser = argparse.ArgumentParser(description="AI Evaluation: matching quality + HITL effectiveness")
    parser.add_argument("--matching", action="store_true", help="Run matching quality evaluation only")
    parser.add_argument("--hitl", action="store_true", help="Run HITL effectiveness evaluation only")
    parser.add_argument("--json", action="store_true", help="Output results as JSON")
    parser.add_argument("--sample-jobs", type=int, default=10, help="Number of jobs to sample (default: 10)")
    parser.add_argument("--candidates", type=int, default=20, help="Candidates per job (default: 20)")
    parser.add_argument("--top-k", type=int, default=5, help="Shortlist size (default: 5)")
    args = parser.parse_args()

    run_both = not args.matching and not args.hitl
    output = {}

    if args.matching or run_both:
        print("=" * 64)
        print("  Matching Quality Evaluation")
        print("=" * 64)
        matching_results = await evaluate_matching_quality(
            sample_jobs=args.sample_jobs,
            candidates_per_job=args.candidates,
            top_k=args.top_k,
        )
        output["matching_quality"] = matching_results
        if not args.json:
            _print_matching(matching_results)
            print()

    if args.hitl or run_both:
        print("=" * 64)
        print("  Human-in-the-Loop Effectiveness")
        print("=" * 64)
        hitl_results = await evaluate_hitl_effectiveness()
        output["hitl_effectiveness"] = hitl_results
        if not args.json:
            _print_hitl(hitl_results)
            print()

    if args.json:
        print(json.dumps(output, indent=2, default=str))

    # Close MongoDB connection
    mongo_client.close()


if __name__ == "__main__":
    asyncio.run(main())
