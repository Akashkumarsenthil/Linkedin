"""
Redis Cache Benchmark
=====================
Compares response times for cache-miss (first request) vs cache-hit (subsequent
requests) on two Redis-backed endpoints:

  POST /members/get    — member profile by ID   (TTL 300 s)
  POST /jobs/search    — job search results      (TTL 300 s)

The script flushes the relevant Redis keys before each trial so every "cold"
measurement is a genuine cache miss hitting MySQL.

Requirements
------------
  pip install requests redis

Usage
-----
  python cache_benchmark.py [--host http://localhost:8000] [--member-id 1] [--job-id 1] [--repeats 10]

Example
-------
  python cache_benchmark.py --host http://localhost:8000 --member-id 5 --repeats 15
"""

import argparse
import statistics
import time
import sys

try:
    import requests
except ImportError:
    sys.exit("requests is not installed. Run: pip install requests")

try:
    import redis as redis_lib
except ImportError:
    sys.exit("redis is not installed. Run: pip install redis")


# ── Config ────────────────────────────────────────────────────────────────────

DEFAULT_HOST      = "http://localhost:8000"
DEFAULT_MEMBER_ID = 1
DEFAULT_JOB_ID    = 1
DEFAULT_REPEATS   = 10

REDIS_HOST = "localhost"
REDIS_PORT = 6379
REDIS_DB   = 0


# ── Helpers ───────────────────────────────────────────────────────────────────

def _ms(t: float) -> str:
    return f"{t * 1000:.2f} ms"


def _delete_redis_key(r: redis_lib.Redis, key: str):
    """Delete a specific key. Silently ignores missing keys."""
    r.delete(key)


def _delete_redis_pattern(r: redis_lib.Redis, pattern: str):
    """Delete all keys matching a glob pattern."""
    keys = r.keys(pattern)
    if keys:
        r.delete(*keys)


def _post(session: requests.Session, host: str, path: str, payload: dict) -> float:
    """POST JSON payload, return elapsed seconds. Raises on non-200."""
    t0 = time.perf_counter()
    resp = session.post(f"{host}{path}", json=payload, timeout=10)
    elapsed = time.perf_counter() - t0
    if resp.status_code != 200:
        raise RuntimeError(f"{path} returned HTTP {resp.status_code}")
    body = resp.json()
    if not body.get("success"):
        # Some endpoints return 200 with success:False (e.g. member not found)
        print(f"  [warn] {path} returned success:False — check ID exists in DB")
    return elapsed


def _run_trial(
    label: str,
    session: requests.Session,
    host: str,
    path: str,
    payload: dict,
    repeats: int,
    warm: bool,
) -> list[float]:
    """
    Run `repeats` requests against `path`.
    If warm=True the cache was already populated; if False the first call is cold.
    Returns list of elapsed times in seconds.
    """
    times = []
    for i in range(repeats):
        elapsed = _post(session, host, path, payload)
        times.append(elapsed)
    return times


def _print_stats(label: str, times: list[float]):
    if not times:
        return
    print(f"  {label}")
    print(f"    n       : {len(times)}")
    print(f"    min     : {_ms(min(times))}")
    print(f"    median  : {_ms(statistics.median(times))}")
    print(f"    mean    : {_ms(statistics.mean(times))}")
    print(f"    p95     : {_ms(sorted(times)[int(len(times) * 0.95)])}")
    print(f"    max     : {_ms(max(times))}")


def benchmark_member_get(host: str, member_id: int, repeats: int, redis_client: redis_lib.Redis):
    """Benchmark POST /members/get — Redis key: members:get:{member_id}"""
    path    = "/members/get"
    payload = {"member_id": member_id}
    key     = f"members:get:{member_id}"

    print(f"\n{'='*60}")
    print(f"Benchmark: POST /members/get  (member_id={member_id})")
    print(f"{'='*60}")

    # ── Cold pass (cache miss) ──────────────────────────────────────
    _delete_redis_key(redis_client, key)
    print(f"\n[Cold — cache miss × {repeats}]")
    session = requests.Session()
    cold_times = []
    for i in range(repeats):
        _delete_redis_key(redis_client, key)   # ensure miss every time
        elapsed = _post(session, host, path, payload)
        cold_times.append(elapsed)
        print(f"  req {i+1:02d}: {_ms(elapsed)}")
    _print_stats("Cold stats", cold_times)

    # ── Warm pass (cache hit) ───────────────────────────────────────
    # Seed the cache with one real request, then measure repeated hits
    _post(session, host, path, payload)        # seed
    print(f"\n[Warm — cache hit × {repeats}]")
    warm_times = []
    for i in range(repeats):
        elapsed = _post(session, host, path, payload)
        warm_times.append(elapsed)
        print(f"  req {i+1:02d}: {_ms(elapsed)}")
    _print_stats("Warm stats", warm_times)

    # ── Summary ─────────────────────────────────────────────────────
    cold_med = statistics.median(cold_times)
    warm_med = statistics.median(warm_times)
    if warm_med > 0:
        speedup = cold_med / warm_med
        print(f"\n  Cache speedup (median): {speedup:.1f}x  "
              f"({_ms(cold_med)} → {_ms(warm_med)})")


def benchmark_jobs_search(host: str, repeats: int, redis_client: redis_lib.Redis):
    """Benchmark POST /jobs/search — Redis key: jobs:search:engineer:..."""
    path    = "/jobs/search"
    payload = {"keyword": "engineer", "page": 1, "page_size": 10}
    pattern = "jobs:search:engineer:*"

    print(f"\n{'='*60}")
    print(f"Benchmark: POST /jobs/search  (keyword='engineer')")
    print(f"{'='*60}")

    # ── Cold pass ──────────────────────────────────────────────────
    _delete_redis_pattern(redis_client, pattern)
    print(f"\n[Cold — cache miss × {repeats}]")
    session = requests.Session()
    cold_times = []
    for i in range(repeats):
        _delete_redis_pattern(redis_client, pattern)
        elapsed = _post(session, host, path, payload)
        cold_times.append(elapsed)
        print(f"  req {i+1:02d}: {_ms(elapsed)}")
    _print_stats("Cold stats", cold_times)

    # ── Warm pass ──────────────────────────────────────────────────
    _post(session, host, path, payload)        # seed
    print(f"\n[Warm — cache hit × {repeats}]")
    warm_times = []
    for i in range(repeats):
        elapsed = _post(session, host, path, payload)
        warm_times.append(elapsed)
        print(f"  req {i+1:02d}: {_ms(elapsed)}")
    _print_stats("Warm stats", warm_times)

    cold_med = statistics.median(cold_times)
    warm_med = statistics.median(warm_times)
    if warm_med > 0:
        speedup = cold_med / warm_med
        print(f"\n  Cache speedup (median): {speedup:.1f}x  "
              f"({_ms(cold_med)} → {_ms(warm_med)})")


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Redis cache benchmark for LinkedIn Platform")
    parser.add_argument("--host",      default=DEFAULT_HOST,      help="Backend base URL")
    parser.add_argument("--member-id", default=DEFAULT_MEMBER_ID, type=int,
                        help="Member ID to benchmark (must exist in DB)")
    parser.add_argument("--repeats",   default=DEFAULT_REPEATS,   type=int,
                        help="Number of requests per cold/warm pass")
    args = parser.parse_args()

    # Connect to Redis
    try:
        r = redis_lib.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB,
                            decode_responses=True, socket_connect_timeout=3)
        r.ping()
        print(f"Connected to Redis at {REDIS_HOST}:{REDIS_PORT}")
    except redis_lib.ConnectionError as e:
        sys.exit(f"Cannot connect to Redis: {e}\n"
                 "Make sure `docker compose up -d` is running.")

    # Check backend health
    try:
        resp = requests.get(f"{args.host}/health", timeout=5)
        resp.raise_for_status()
        print(f"Backend healthy at {args.host}")
    except Exception as e:
        sys.exit(f"Cannot reach backend at {args.host}: {e}\n"
                 "Make sure `uvicorn main:app --port 8000` is running.")

    benchmark_member_get(args.host, args.member_id, args.repeats, r)
    benchmark_jobs_search(args.host, args.repeats, r)

    print(f"\n{'='*60}")
    print("Benchmark complete.")
    print("="*60)


if __name__ == "__main__":
    main()
