#!/usr/bin/env python3
"""
Generate bar charts from perf_comparison.py JSON output.

Usage:
  python perf_comparison.py --json > results.json
  python generate_charts.py results.json                  # ASCII charts
  python generate_charts.py results.json --png charts/    # PNG charts (needs matplotlib)
"""

import json
import os
import sys

def load_results(path: str) -> dict:
    with open(path) as f:
        return json.load(f)


def ascii_bar_chart(title: str, labels: list, values: list, unit: str = ""):
    """Print a horizontal ASCII bar chart."""
    max_val = max(values) if values else 1
    bar_width = 40
    print(f"\n  {title}")
    print(f"  {'─' * 56}")
    for label, val in zip(labels, values):
        bar_len = int((val / max_val) * bar_width) if max_val > 0 else 0
        bar = '█' * bar_len
        print(f"  {label:<10} {bar} {val:.1f}{unit}")
    print()


def generate_ascii_charts(data: dict):
    results = data["results"]
    params = data["parameters"]

    print(f"{'═' * 64}")
    print(f"  Performance Comparison Charts")
    print(f"  {params['users']} concurrent users, {params['duration_s']}s per run")
    print(f"{'═' * 64}")

    for scenario in ["A", "B"]:
        scenario_results = [r for r in results if r["scenario"] == scenario]
        if not scenario_results:
            continue
        scenario_label = "Scenario A: Job Search + Detail View" if scenario == "A" else "Scenario B: Application Submit (DB + Kafka)"

        labels = [r["mode"] for r in scenario_results]

        # Throughput chart
        values = [r["throughput_rps"] for r in scenario_results]
        ascii_bar_chart(f"{scenario_label} — Throughput (req/s, higher is better)", labels, values, " req/s")

        # P50 latency chart
        values = [r["p50_ms"] for r in scenario_results]
        ascii_bar_chart(f"{scenario_label} — P50 Latency (ms, lower is better)", labels, values, " ms")

        # P95 latency chart
        values = [r["p95_ms"] for r in scenario_results]
        ascii_bar_chart(f"{scenario_label} — P95 Latency (ms, lower is better)", labels, values, " ms")

    # Deployment comparison section
    bsko_results = [r for r in results if r["mode"] == "B+S+K+O"]
    if bsko_results:
        print(f"\n{'═' * 64}")
        print(f"  Deployment Comparison — Single Instance vs 3 Replicas (est.)")
        print(f"{'═' * 64}")
        print(f"  {'Scenario':<20} {'Single':>12} {'3-Replica':>14} {'Factor':>10}")
        print(f"  {'─'*20} {'─'*12} {'─'*14} {'─'*10}")
        for r in bsko_results:
            label = "A (Reads)" if r["scenario"] == "A" else "B (Writes)"
            est_factor = 2.2 if r["scenario"] == "A" else 1.8
            est_rps = r["throughput_rps"] * est_factor
            print(f"  {label:<20} {r['throughput_rps']:>10.1f}/s {est_rps:>12.1f}/s {est_factor:>8.1f}x")
        print(f"\n  Note: 3-replica estimates use sub-linear scaling factors")
        print(f"  (2.2x reads, 1.8x writes) due to shared MySQL contention.")
        print(f"  Multi-replica requires nginx/LB in docker-compose.yml.")

    # Comparison table
    print(f"\n{'═' * 72}")
    print(f"  FULL RESULTS TABLE")
    print(f"{'═' * 72}")
    print(f"  {'Mode':<10} {'Scen':<6} {'Reqs':>7} {'RPS':>8} "
          f"{'Mean':>8} {'P50':>8} {'P95':>8} {'P99':>8} {'Err%':>6}")
    print(f"  {'─'*10} {'─'*6} {'─'*7} {'─'*8} {'─'*8} {'─'*8} {'─'*8} {'─'*8} {'─'*6}")
    for r in results:
        print(f"  {r['mode']:<10} {r['scenario']:<6} {r['total_requests']:>7,} {r['throughput_rps']:>8.1f} "
              f"{r['mean_ms']:>7.1f}ms {r['p50_ms']:>7.1f}ms {r['p95_ms']:>7.1f}ms "
              f"{r['p99_ms']:>7.1f}ms {r['error_rate']:>5.1f}%")
    print(f"{'═' * 72}")


def generate_png_charts(data: dict, output_dir: str):
    """Generate PNG bar charts using matplotlib."""
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib not installed. Install with: pip install matplotlib")
        print("Falling back to ASCII charts.")
        generate_ascii_charts(data)
        return

    os.makedirs(output_dir, exist_ok=True)
    results = data["results"]
    params = data["parameters"]

    for scenario in ["A", "B"]:
        scenario_results = [r for r in results if r["scenario"] == scenario]
        if not scenario_results:
            continue
        scenario_label = "Scenario A: Read (Search + Detail)" if scenario == "A" else "Scenario B: Write (Apply Submit)"

        modes = [r["mode"] for r in scenario_results]
        colors = ['#d32f2f', '#1976d2', '#388e3c', '#f57c00'][:len(modes)]

        # Throughput chart
        fig, ax = plt.subplots(figsize=(8, 4))
        rps_values = [r["throughput_rps"] for r in scenario_results]
        bars = ax.bar(modes, rps_values, color=colors, width=0.6)
        ax.set_title(f"{scenario_label}\nThroughput ({params['users']} users, {params['duration_s']}s)", fontsize=12)
        ax.set_ylabel("Requests/sec")
        for bar, val in zip(bars, rps_values):
            ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.5,
                    f"{val:.1f}", ha='center', va='bottom', fontsize=10)
        plt.tight_layout()
        fname = f"throughput_scenario_{scenario}.png"
        plt.savefig(os.path.join(output_dir, fname), dpi=150)
        plt.close()
        print(f"  Saved {output_dir}/{fname}")

        # Latency chart (P50, P95, P99 grouped)
        fig, ax = plt.subplots(figsize=(8, 4))
        x = range(len(modes))
        width = 0.25
        p50_vals = [r["p50_ms"] for r in scenario_results]
        p95_vals = [r["p95_ms"] for r in scenario_results]
        p99_vals = [r["p99_ms"] for r in scenario_results]
        ax.bar([i - width for i in x], p50_vals, width, label='P50', color='#1976d2')
        ax.bar(x, p95_vals, width, label='P95', color='#f57c00')
        ax.bar([i + width for i in x], p99_vals, width, label='P99', color='#d32f2f')
        ax.set_xticks(x)
        ax.set_xticklabels(modes)
        ax.set_title(f"{scenario_label}\nLatency ({params['users']} users, {params['duration_s']}s)", fontsize=12)
        ax.set_ylabel("Latency (ms)")
        ax.legend()
        plt.tight_layout()
        fname = f"latency_scenario_{scenario}.png"
        plt.savefig(os.path.join(output_dir, fname), dpi=150)
        plt.close()
        print(f"  Saved {output_dir}/{fname}")

    # Deployment comparison chart (single vs 3-replica estimate)
    bsko_results = [r for r in results if r["mode"] == "B+S+K+O"]
    if bsko_results:
        fig, ax = plt.subplots(figsize=(8, 4))
        scenarios_found = [r["scenario"] for r in bsko_results]
        x = range(len(scenarios_found))
        single_rps = [r["throughput_rps"] for r in bsko_results]
        multi_rps = [r["throughput_rps"] * 2.2 for r in bsko_results]
        width = 0.35
        ax.bar([i - width/2 for i in x], single_rps, width, label='Single Instance', color='#1976d2')
        ax.bar([i + width/2 for i in x], multi_rps, width, label='3 Replicas (est.)', color='#388e3c')
        labels = ["Scenario A\n(Reads)" if s == "A" else "Scenario B\n(Writes)" for s in scenarios_found]
        ax.set_xticks(x)
        ax.set_xticklabels(labels)
        ax.set_title(f"Deployment Comparison — Single vs 3-Replica\n({params['users']} users, B+S+K+O mode)", fontsize=12)
        ax.set_ylabel("Requests/sec")
        for bars in ax.containers:
            ax.bar_label(bars, fmt='%.0f', padding=2, fontsize=9)
        ax.legend()
        plt.tight_layout()
        fname = "deployment_comparison.png"
        plt.savefig(os.path.join(output_dir, fname), dpi=150)
        plt.close()
        print(f"  Saved {output_dir}/{fname}")

    print(f"\n  All charts saved to {output_dir}/")


def main():
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} results.json [--png output_dir/]")
        sys.exit(1)

    data = load_results(sys.argv[1])

    if "--png" in sys.argv:
        idx = sys.argv.index("--png")
        output_dir = sys.argv[idx + 1] if idx + 1 < len(sys.argv) else "charts"
        generate_png_charts(data, output_dir)
    else:
        generate_ascii_charts(data)


if __name__ == "__main__":
    main()
