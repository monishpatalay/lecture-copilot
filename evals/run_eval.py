"""Measure retrieval and answer quality against evals/questions.jsonl.

    python3 evals/run_eval.py                # retrieval only: recall@3, MRR, relevance gate (no LLM, about a minute)
    python3 evals/run_eval.py --answers 30   # also ask 30 questions end to end through /api/ask

Needs `supabase start`, and for --answers the web app on http://localhost:3000.
Standard library only, so it runs anywhere Python does. Results go to evals/results.json.
"""
import argparse
import hashlib
import json
import math
import statistics
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEMO_COURSE = "00000000-0000-0000-0000-000000000001"
TOP_K = 6  # segments the answer model is shown
# Groq's free tier allows about four questions a minute; slower than that keeps answers on the primary model.
SECONDS_BETWEEN_ANSWERS = 15


# ── metrics (pure, tested in test_metrics.py) ────────────────────────────

def overlaps(segment: dict, question: dict) -> bool:
    """True when a retrieved segment is in the gold lecture and shares any time with the gold span."""
    return (
        segment["lecture_number"] == question["lecture_no"]
        and segment["start_s"] < question["gold_end_s"]
        and segment["end_s"] > question["gold_start_s"]
    )


def first_hit_rank(segments: list[dict], question: dict) -> int | None:
    """1-based position of the first retrieved segment that contains the answer, or None if none does."""
    return next((i for i, s in enumerate(segments, 1) if overlaps(s, question)), None)


def recall_at(ranks: list[int | None], k: int) -> float:
    return sum(r is not None and r <= k for r in ranks) / len(ranks)


def mean_reciprocal_rank(ranks: list[int | None]) -> float:
    return sum(1 / r for r in ranks if r is not None) / len(ranks)


def percentile(values: list[float], p: float) -> float:
    """Nearest-rank percentile, p in 0..100."""
    ordered = sorted(values)
    return ordered[max(0, math.ceil(p / 100 * len(ordered)) - 1)]


def pick_subset(questions: list[dict], n: int) -> list[dict]:
    """The same n questions on every machine and every run: ordered by a hash of their text."""
    return sorted(questions, key=lambda q: hashlib.sha256(q["question"].encode()).hexdigest())[:n]


def best_threshold(covered: list[float], uncovered: list[float]) -> tuple[float, float]:
    """The relevance gate that turns away the most uncovered questions while never blocking a covered one.

    Returns (threshold, share of uncovered questions it blocks). The answer model still has the final say
    on anything that passes, so the gate only needs to be safe, not sharp.
    """
    threshold = round(min(covered) - 0.005, 3)
    return threshold, sum(s < threshold for s in uncovered) / len(uncovered) if uncovered else 0.0


# ── talking to the system ────────────────────────────────────────────────

def read_env() -> dict[str, str]:
    pairs = (line.split("=", 1) for line in (ROOT / ".env").read_text().splitlines() if "=" in line and not line.startswith("#"))
    return {key.strip(): value.strip() for key, value in pairs}


def post(url: str, body: dict, headers: dict | None = None, timeout: int = 120) -> tuple[int, dict | list]:
    request = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)


def retrieve(question: str, course_id: str, env: dict[str, str]) -> list[dict]:
    """Exactly what /api/ask does before calling the model: embed with the Edge Function, then match_segments."""
    base = env["NEXT_PUBLIC_SUPABASE_URL"]
    auth = {"Authorization": f"Bearer {env['NEXT_PUBLIC_SUPABASE_ANON_KEY']}", "apikey": env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]}
    status, embedded = post(f"{base}/functions/v1/embed", {"input": question}, auth)
    if status != 200:
        raise RuntimeError(f"embed failed ({status}): {embedded}")
    status, rows = post(
        f"{base}/rest/v1/rpc/match_segments",
        {"query_embedding": json.dumps(embedded["embedding"]), "query_text": question, "p_course_id": course_id, "k": TOP_K},
        auth,
    )
    if status != 200:
        raise RuntimeError(f"match_segments failed ({status}): {rows}")
    return rows


# ── the two passes ───────────────────────────────────────────────────────

def retrieval_pass(questions: list[dict], course_id: str, env: dict[str, str]) -> tuple[dict, dict[str, list[dict]]]:
    retrieved = {q["question"]: retrieve(q["question"], course_id, env) for q in questions}
    covered = [q for q in questions if q["covered"]]
    ranks = [first_hit_rank(retrieved[q["question"]], q) for q in covered]
    top = lambda q: max((s["similarity"] for s in retrieved[q["question"]]), default=0.0)  # noqa: E731
    covered_top = [top(q) for q in covered]
    uncovered_top = [top(q) for q in questions if not q["covered"]]
    threshold, blocked = best_threshold(covered_top, uncovered_top)
    metrics = {
        "questions": len(questions),
        "covered": len(covered),
        "recall_at_1": recall_at(ranks, 1),
        "recall_at_3": recall_at(ranks, 3),
        f"recall_at_{TOP_K}": recall_at(ranks, TOP_K),
        "mrr": mean_reciprocal_rank(ranks),
        "top_similarity_covered_min": min(covered_top),
        "top_similarity_covered_median": statistics.median(covered_top),
        "top_similarity_uncovered_median": statistics.median(uncovered_top) if uncovered_top else None,
        "suggested_gate_threshold": threshold,
        "uncovered_blocked_by_suggested_gate": blocked,
        "misses": [q["question"] for q, r in zip(covered, ranks) if r is None],
    }
    return metrics, retrieved


def answer_pass(questions: list[dict], retrieved: dict[str, list[dict]], course_id: str, web: str, delay: float) -> dict:
    outcomes = []
    for i, q in enumerate(questions):
        if i:
            time.sleep(delay)
        started = time.perf_counter()
        status, body = post(f"{web}/api/ask", {"question": q["question"], "courseId": course_id})
        seconds = time.perf_counter() - started
        data = body.get("data") or {}
        gold_ids = {s["id"] for s in retrieved[q["question"]] if q["covered"] and overlaps(s, q)}
        outcomes.append({
            "question": q["question"],
            "covered": q["covered"],
            "http": status,
            "answered": bool(data.get("covered")),
            "said_not_covered": status == 200 and not data.get("covered"),
            "unverifiable": status == 502 and "verify" in body.get("error", ""),
            "cites_gold": any(c["segmentId"] in gold_ids for c in data.get("citations", [])),
            "model": data.get("model"),
            "seconds": round(seconds, 2),
        })
        print(f"  {i + 1:>3}/{len(questions)} {status} {seconds:5.1f}s {'answered' if outcomes[-1]['answered'] else 'not covered' if outcomes[-1]['said_not_covered'] else 'ERROR':11s} {q['question'][:70]}")

    covered = [o for o in outcomes if o["covered"]]
    uncovered = [o for o in outcomes if not o["covered"]]
    generated = [o for o in outcomes if o["answered"] or o["unverifiable"]]
    answered_covered = [o for o in covered if o["answered"]]
    seconds = [o["seconds"] for o in outcomes]
    share = lambda part, whole: len(part) / len(whole) if whole else None  # noqa: E731
    return {
        "asked": len(outcomes),
        # Of the answers the model wrote, how many passed the code check that every citation is a retrieved segment.
        "citation_validity": share([o for o in generated if o["answered"]], generated),
        # Of the covered questions that got an answer, how many cite a segment containing the gold span.
        "answers_citing_gold": share([o for o in answered_covered if o["cites_gold"]], answered_covered),
        # Right call on "is this covered?": answered when it is, "Not covered" when it isn't.
        "not_covered_accuracy": share([o for o in covered if o["answered"]] + [o for o in uncovered if o["said_not_covered"]], outcomes),
        "covered_wrongly_refused": share([o for o in covered if o["said_not_covered"]], covered),
        "uncovered_wrongly_answered": share([o for o in uncovered if o["answered"]], uncovered),
        "errors": len([o for o in outcomes if o["http"] != 200]),
        "latency_s_p50": percentile(seconds, 50),
        "latency_s_p95": percentile(seconds, 95),
        # "none" = no model was called: the relevance gate refused, or the request failed.
        "models": {m: sum((o["model"] or "none") == m for o in outcomes) for m in sorted({o["model"] or "none" for o in outcomes})},
        "outcomes": outcomes,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--questions", type=Path, default=ROOT / "evals" / "questions.jsonl")
    parser.add_argument("--course-id", default=DEMO_COURSE)
    parser.add_argument("--answers", type=int, default=0, metavar="N", help="also ask N questions through /api/ask")
    parser.add_argument("--web", default="http://localhost:3000")
    parser.add_argument("--delay", type=float, default=SECONDS_BETWEEN_ANSWERS, help="seconds between /api/ask calls")
    args = parser.parse_args()

    questions = [json.loads(line) for line in args.questions.read_text().splitlines() if line.strip()]
    env = read_env()

    print(f"retrieval over {len(questions)} questions…")
    retrieval, retrieved = retrieval_pass(questions, args.course_id, env)
    results = {"retrieval": retrieval}
    for name, value in retrieval.items():
        if name != "misses":
            print(f"  {name:38s} {value:.3f}" if isinstance(value, float) else f"  {name:38s} {value}")
    print(f"  not retrieved in the top {TOP_K}: {len(retrieval['misses'])}")

    if args.answers:
        subset = pick_subset(questions, args.answers)
        print(f"asking {len(subset)} questions end to end ({args.delay:.0f} s apart)…")
        results["answers"] = answer_pass(subset, retrieved, args.course_id, args.web, args.delay)
        for name, value in results["answers"].items():
            if name != "outcomes":
                print(f"  {name:38s} {value:.3f}" if isinstance(value, float) else f"  {name:38s} {value}")

    out = ROOT / "evals" / "results.json"
    out.write_text(json.dumps(results, indent=1, ensure_ascii=False) + "\n")
    print(f"written to {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
