"""
Redis Cache Benchmark
=====================
Measures the latency difference between a cache-miss (first request, MySQL)
and a cache-hit (repeated request, Redis) for three endpoints:

  POST /members/get    — members:get:{id}         TTL 300 s
  POST /members/search — members:search:{...}      TTL  60 s
  POST /jobs/search    — jobs:search:{...}          TTL  60 s

The script deliberately evicts the Redis key before each "cold" pass so every
cold measurement is a genuine MySQL round-trip, not a leftover cache entry.

Usage
-----
  cd backend
  source venv/bin/activate
  python cache_benchmark.py [options]

Options
-------
  --host       Backend base URL  (default: http://localhost:8000)
  --member-id  Member ID for /members/get  (default: 1)
  --repeats    Requests per cold/warm pass (default: 10)
  --no-evict   Skip Redis key eviction — useful to inspect a warm cache
               without touching Redis directly

Requirements
------------
  httpx and redis are already listed in backend/requirements.txt.
"""

import argparse
import statistics
import sys
import time

# ── import httpx / redis (already in backend/requirements.txt) ────────────────
try:
    import httpx
except ImportError:
    sys.exit("httpx not installed. Run: pip install -r requirements.txt")

try:
    import redis as redis_lib
except ImportError:
    sys.exit("redis not installed. Run: pip install -r requirements.txt")

# ── import app config so we pick up the right Redis host/port ─────────────────
try:
    import sys, os
    sys.path.insert(0, os.path.dirname(__file__))
    from config import settings
    REDIS_HOST = settings.REDIS_HOST
    REDIS_PORT = settings.REDIS_PORT
    REDIS_DB   = settings.REDIS_DB
except Exception:
    REDIS_HOST = "localhost"
    REDIS_PORT = 6379
    REDIS_DB   = 0

DEFAULT_HOST      = "http://localhost:8000"
DEFAULT_MEMBER_ID = 1
DEFAULT_REPEATS   = 10


# ── helpers ───────────────────────────────────────────────────────────────────

def ms(t: float) -> str:
    return f"{t * 1000:7.2f} ms"


def print_stats(label: str, times: list[float]) -> None:
    if not times:
        return
    s = sorted(times)
    p95_idx = max(0, int(len(s) * 0.95) - 1)
    print(f"    {label:<6}  "
          f"min {ms(s[0])}  "
          f"median {ms(statistics.median(s))}  "
          f"p95 {ms(s[p95_idx])}  "
          f"max {ms(s[-1])}")


def post(client: httpx.Client, host: str, path: str, payload: dict) -> float:
    """POST JSON, return wall-clock seconds. Raises on non-200."""
    t0 = time.perf_counter()
    r = client.post(f"{host}{path}", json=payload, timeout=10)
    elapsed = time.perf_counter() - t0
    if r.status_code != 200:
        raise RuntimeError(f"{path} → HTTP {r.status_code}: {r.text[:120]}")
    body = r.json()
    if not body.get("success"):
        # Warn but don't abort — member/job may not exist; timing is still valid
        print(f"  [warn] success:false on {path} — check ID exists in DB")
    return elapsed


def evict(r: redis_lib.Redis, *keys_or_patterns: str) -> None:
    """Delete exact keys; patterns starting with * use KEYS scan."""
    for k in keys_or_patterns:
        if "*" in k:
            found = r.keys(k)
            if found:
                r.delete(*found)
        else:
            r.delete(k)


# ── benchmark runners ─────────────────────────────────────────────────────────

def bench_members_get(
    host: str, member_id: int, repeats: int,
    rc: redis_lib.Redis, do_evict: bool,
) -> None:
    path    = "/members/get"
    payload = {"member_id": member_id}
    key     = f"members:get:{member_id}"

    print(f"\n{'─'*62}")
    print(f"  POST /members/get  (member_id={member_id})")
    print(f"{'─'*62}")

    with httpx.Client() as client:
        # cold pass
        cold: list[float] = []
        for i in range(repeats):
            if do_evict:
                evict(rc, key)
            elapsed = post(client, host, path, payload)
            cold.append(elapsed)
            status = "miss" if do_evict else "?"
            print(f"  req {i+1:02d} [{status}]  {ms(elapsed)}")

        # warm pass — seed once, then measure hits
        post(client, host, path, payload)   # seed
        print()
        warm: list[float] = []
        for i in range(repeats):
            elapsed = post(client, host, path, payload)
            warm.append(elapsed)
            print(f"  req {i+1:02d} [hit ]  {ms(elapsed)}")

    print()
    print_stats("cold", cold)
    print_stats("warm", warm)
    cold_med = statistics.median(cold)
    warm_med = statistics.median(warm)
    if warm_med > 0:
        print(f"\n    Speedup (median cold / median warm): "
              f"{cold_med / warm_med:.1f}×  "
              f"({ms(cold_med)} → {ms(warm_med)})")


def bench_members_search(
    host: str, repeats: int,
    rc: redis_lib.Redis, do_evict: bool,
) -> None:
    path    = "/members/search"
    payload = {"keyword": "engineer", "page": 1, "page_size": 10}
    pattern = "members:search:engineer:*"

    print(f"\n{'─'*62}")
    print(f"  POST /members/search  (keyword='engineer')")
    print(f"{'─'*62}")

    with httpx.Client() as client:
        cold: list[float] = []
        for i in range(repeats):
            if do_evict:
                evict(rc, pattern)
            elapsed = post(client, host, path, payload)
            cold.append(elapsed)
            status = "miss" if do_evict else "?"
            print(f"  req {i+1:02d} [{status}]  {ms(elapsed)}")

        post(client, host, path, payload)   # seed
        print()
        warm: list[float] = []
        for i in range(repeats):
            elapsed = post(client, host, path, payload)
            warm.append(elapsed)
            print(f"  req {i+1:02d} [hit ]  {ms(elapsed)}")

    print()
    print_stats("cold", cold)
    print_stats("warm", warm)
    cold_med = statistics.median(cold)
    warm_med = statistics.median(warm)
    if warm_med > 0:
        print(f"\n    Speedup (median cold / median warm): "
              f"{cold_med / warm_med:.1f}×  "
              f"({ms(cold_med)} → {ms(warm_med)})")


def bench_jobs_search(
    host: str, repeats: int,
    rc: redis_lib.Redis, do_evict: bool,
) -> None:
    path    = "/jobs/search"
    payload = {"keyword": "engineer", "page": 1, "page_size": 10}
    pattern = "jobs:search:engineer:*"

    print(f"\n{'─'*62}")
    print(f"  POST /jobs/search  (keyword='engineer')")
    print(f"{'─'*62}")

    with httpx.Client() as client:
        cold: list[float] = []
        for i in range(repeats):
            if do_evict:
                evict(rc, pattern)
            elapsed = post(client, host, path, payload)
            cold.append(elapsed)
            status = "miss" if do_evict else "?"
            print(f"  req {i+1:02d} [{status}]  {ms(elapsed)}")

        post(client, host, path, payload)   # seed
        print()
        warm: list[float] = []
        for i in range(repeats):
            elapsed = post(client, host, path, payload)
            warm.append(elapsed)
            print(f"  req {i+1:02d} [hit ]  {ms(elapsed)}")

    print()
    print_stats("cold", cold)
    print_stats("warm", warm)
    cold_med = statistics.median(cold)
    warm_med = statistics.median(warm)
    if warm_med > 0:
        print(f"\n    Speedup (median cold / median warm): "
              f"{cold_med / warm_med:.1f}×  "
              f"({ms(cold_med)} → {ms(warm_med)})")


# ── entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Redis cache benchmark for LinkedIn Platform backend"
    )
    parser.add_argument("--host",      default=DEFAULT_HOST,
                        help=f"Backend base URL (default: {DEFAULT_HOST})")
    parser.add_argument("--member-id", default=DEFAULT_MEMBER_ID, type=int,
                        help="Member ID used by /members/get (must exist in DB)")
    parser.add_argument("--repeats",   default=DEFAULT_REPEATS,   type=int,
                        help="Requests per cold/warm pass (default: 10)")
    parser.add_argument("--no-evict",  action="store_true",
                        help="Skip Redis key eviction before cold pass")
    args = parser.parse_args()

    do_evict = not args.no_evict

    # ── Connect to Redis ────────────────────────────────────────
    try:
        rc = redis_lib.Redis(
            host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB,
            decode_responses=True, socket_connect_timeout=3,
        )
        rc.ping()
        print(f"Redis   : {REDIS_HOST}:{REDIS_PORT}  ✓")
    except redis_lib.ConnectionError as e:
        sys.exit(f"Cannot connect to Redis ({REDIS_HOST}:{REDIS_PORT}): {e}\n"
                 "Run: docker compose up -d")

    # ── Check backend health ────────────────────────────────────
    try:
        resp = httpx.get(f"{args.host}/health", timeout=5)
        resp.raise_for_status()
        print(f"Backend : {args.host}  ✓")
    except Exception as e:
        sys.exit(f"Cannot reach backend at {args.host}: {e}\n"
                 "Run: uvicorn main:app --port 8000")

    print(f"Repeats : {args.repeats} per pass  |  evict={do_evict}")
    print()
    print("Legend")
    print("  [miss] = Redis key was evicted before this request → MySQL hit")
    print("  [hit ] = Redis key present → Redis hit (no MySQL)")
    print("  [?   ] = --no-evict mode; actual source depends on prior state")

    bench_members_get(args.host, args.member_id, args.repeats, rc, do_evict)
    bench_members_search(args.host, args.repeats, rc, do_evict)
    bench_jobs_search(args.host, args.repeats, rc, do_evict)

    print(f"\n{'═'*62}")
    print("  Benchmark complete.")
    print(f"  How to read the results:")
    print(f"    cold median  = typical MySQL latency (no cache)")
    print(f"    warm median  = typical Redis latency (cache hit)")
    print(f"    speedup      = cold / warm — how many times faster Redis is")
    print(f"  Speedup of 5–20× is normal for a local Docker setup.")
    print(f"  Larger datasets produce bigger cold/warm gaps.")
    print(f"{'═'*62}")


if __name__ == "__main__":
    main()
