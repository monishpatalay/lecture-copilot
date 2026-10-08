"""Measure retrieval and answer quality against evals/questions.jsonl.

    python3 evals/run_eval.py                # retrieval only: recall@3, MRR, relevance gate (no LLM, about a minute)
    python3 evals/run_eval.py --answers 30   # also ask 30 questions end to end through /api/ask, and judge the answers
    python3 evals/run_eval.py --served       # also measure what the app serves after reranking (needs the web app and model keys)
    python3 evals/run_eval.py --check-gold   # have a second model check that each gold passage answers its question
    python3 evals/run_eval.py --review-sheet 30   # write evals/review_sheet.md for a person to go through

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
MAX_RECALL_DROP = 0.03  # CI fails when recall@3 falls further than this below the baseline
# The judge is a different model family from the one that writes the answers, so it doesn't mark its own homework.
# Neither is used by the app itself, so judging doesn't spend the app's own daily free-tier allowance.
JUDGE_MODELS = ("gemini-3.5-flash", "gemini-3-flash-preview")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"


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


def seconds_from_span(t: float, start: float, end: float) -> float:
    """How far a moment is from a time span: 0 inside it, otherwise the gap to its nearer edge."""
    return max(start - t, 0.0, t - end)


def claims_of(answer: str, citations: list[dict]) -> list[dict]:
    """Pairs each citation with the text it backs: what the answer says between the previous citation and it.

    citations: [{raw, segmentId}] in reading order, as /api/ask returns them. Two citations in a row share a claim.
    """
    claims, cursor, text = [], 0, ""
    for citation in citations:
        at = answer.find(citation["raw"], cursor)
        if at < 0:
            continue
        between = answer[cursor:at].strip(" .;,\n")
        if len(between.split()) >= 2:
            text = between
        if text:
            claims.append({"text": text, "segmentId": citation["segmentId"]})
        cursor = at + len(citation["raw"])
    return claims


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

def read_env(path: Path) -> dict[str, str]:
    pairs = (line.split("=", 1) for line in path.read_text().splitlines() if "=" in line and not line.startswith("#"))
    return {key.strip(): value.strip() for key, value in pairs}


def post(url: str, body: dict, headers: dict | None = None, timeout: int = 120) -> tuple[int, dict | list]:
    request = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        raw = error.read()
        try:
            return error.code, json.loads(raw)
        except ValueError:  # a gateway error page, not the API's own JSON
            return error.code, {"error": raw.decode(errors="replace")[:200]}


def judge(prompt: str, api_key: str) -> list[dict]:
    """Asks the judge model for a JSON array of verdicts. Falls back to the lighter model when the first is busy."""
    for model in JUDGE_MODELS:
        for attempt in range(2):  # the stronger judge is often overloaded; don't wait long for it
            request = urllib.request.Request(
                GEMINI_URL,
                data=json.dumps({"model": model, "messages": [{"role": "user", "content": prompt}], "reasoning_effort": "low"}).encode(),
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
            )
            try:
                with urllib.request.urlopen(request, timeout=90) as response:
                    text = json.load(response)["choices"][0]["message"]["content"]
                return json.loads(text[text.index("["): text.rindex("]") + 1])
            except urllib.error.HTTPError as error:
                if error.code not in (429, 500, 503):
                    raise
                time.sleep(6 * (attempt + 1))
            except (ValueError, KeyError):
                break  # not JSON: try the other model
    return []


def gold_passage(question: dict, course_id: str, env: dict[str, str]) -> str:
    """The transcript of the segments that overlap a question's gold span."""
    base, key = env["NEXT_PUBLIC_SUPABASE_URL"], env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
    query = (
        f"select=start_s,transcript,lectures!inner(number,course_id)&lectures.number=eq.{question['lecture_no']}"
        f"&lectures.course_id=eq.{course_id}&start_s=lt.{question['gold_end_s']}&end_s=gt.{question['gold_start_s']}&order=start_s"
    )
    request = urllib.request.Request(f"{base}/rest/v1/segments?{query}", headers={"apikey": key, "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return " ".join(row["transcript"] for row in json.load(response))


def check_gold(questions: list[dict], course_id: str, env: dict[str, str]) -> dict:
    """A second model reads each covered question with its gold passage and says whether the passage answers it."""
    covered = [q for q in questions if q["covered"]]
    verdicts: dict[str, str] = {}
    for start in range(0, len(covered), 8):
        batch = covered[start:start + 8]
        items = "\n\n".join(f"Item {i + 1}\nQuestion: {q['question']}\nPassage: {gold_passage(q, course_id, env)}" for i, q in enumerate(batch))
        replies = judge(
            "For each item, does the passage contain the answer to the question? Reply with only a JSON array: "
            '[{"item": 1, "verdict": "yes" | "partly" | "no"}].\n\n' + items,
            env["GEMINI_API_KEY"],
        )
        for reply in replies:
            if isinstance(reply, dict) and isinstance(reply.get("item"), int) and 1 <= reply["item"] <= len(batch):
                verdicts[batch[reply["item"] - 1]["question"]] = str(reply.get("verdict"))
        print(f"  checked {min(start + 8, len(covered))}/{len(covered)}")
        time.sleep(5)
    count = lambda verdict: sum(v == verdict for v in verdicts.values())  # noqa: E731
    return {
        "checked": len(verdicts),
        "passage_answers_question": count("yes"),
        "partly": count("partly"),
        "no": count("no"),
        "not_judged": len(covered) - len(verdicts),
        "to_review": sorted(q for q, v in verdicts.items() if v != "yes"),
    }


def write_review_sheet(questions: list[dict], n: int, course_id: str, env: dict[str, str], out: Path) -> None:
    """A page a person can go through: each sampled question next to the passage marked as answering it."""
    lines = [
        "# Eval question review sheet",
        "",
        "The eval questions and their gold passages were written by an AI model. Tick a box when you agree; "
        "note anything wrong. Passages are automatic transcripts, so expect speech-recognition slips.",
        "",
    ]
    for i, q in enumerate(pick_subset([q for q in questions if q["covered"]], n), 1):
        span = f"{int(q['gold_start_s']) // 60}:{int(q['gold_start_s']) % 60:02d}–{int(q['gold_end_s']) // 60}:{int(q['gold_end_s']) % 60:02d}"
        lines += [
            f"## {i}. {q['question']}",
            "",
            f"Lecture {q['lecture_no']}, {span}",
            "",
            f"> {gold_passage(q, course_id, env)}",
            "",
            "- [ ] The question is clear and has one answer",
            "- [ ] The passage answers it",
            "- Notes:",
            "",
        ]
    out.write_text("\n".join(lines))


def retrieve(question: str, course_id: str, env: dict[str, str]) -> list[dict]:
    """Exactly what /api/ask does before calling the model: embed with the Edge Function, then match_segments."""
    base = env["NEXT_PUBLIC_SUPABASE_URL"]
    auth = {"Authorization": f"Bearer {env['NEXT_PUBLIC_SUPABASE_ANON_KEY']}", "apikey": env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]}
    for attempt in range(4):  # the embed function answers 5xx while it is starting up
        status, embedded = post(f"{base}/functions/v1/embed", {"input": question}, auth)
        if status == 200:
            break
        time.sleep(3 * (attempt + 1))
    else:
        raise RuntimeError(f"embed failed ({status}): {embedded}")
    status, rows = post(
        f"{base}/rest/v1/rpc/match_segments",
        {"query_embedding": json.dumps(embedded["embedding"]), "query_text": question, "p_course_id": course_id, "k": TOP_K},
        auth,
    )
    if status != 200:
        raise RuntimeError(f"match_segments failed ({status}): {rows}")
    return rows


def retrieve_served(question: str, course_id: str, web: str, eval_key: str) -> list[dict]:
    """What the answer model is actually given: search, then the reranker, through the app itself."""
    # The reranker's free tier allows about 15 requests a minute. Asked faster, it answers slowly, the app's
    # three-second cap skips the rerank, and this would measure the skips instead of the reranker.
    time.sleep(6.5)
    status, body = post(f"{web}/api/ask", {"question": question, "courseId": course_id, "retrieveOnly": True}, {"x-eval-key": eval_key})
    if status != 200:
        raise RuntimeError(f"retrieveOnly failed ({status}): {body}")
    return body["data"]["segments"]


# ── the two passes ───────────────────────────────────────────────────────

def retrieval_pass(questions: list[dict], fetch) -> tuple[dict, dict[str, list[dict]]]:
    """fetch(question text) returns the ranked segments for it: plain search, or what the app serves."""
    retrieved = {q["question"]: fetch(q["question"]) for q in questions}
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


def judge_answer(question: str, claims: list[dict], passages: dict[str, str], api_key: str) -> list[str]:
    """One verdict per claim: is it supported by the passage it cites? Unjudged claims come back as 'unknown'."""
    if not claims:
        return []
    items = "\n\n".join(f"Claim {i + 1}: {c['text']}\nCited passage: {passages.get(c['segmentId'], '')}" for i, c in enumerate(claims))
    replies = judge(
        f"A student asked: {question}\n\nEach claim below is a sentence from the answer, with the lecture passage it cites. "
        "Judge each claim against its passage only. 'supported': the passage says it. 'partly': the passage says some of it, "
        "or the claim adds a detail the passage doesn't have. 'unsupported': the passage doesn't say it. "
        'Reply with only a JSON array: [{"claim": 1, "verdict": "supported" | "partly" | "unsupported"}].\n\n' + items,
        api_key,
    )
    verdicts = ["unknown"] * len(claims)
    for reply in replies:
        if isinstance(reply, dict) and isinstance(reply.get("claim"), int) and 1 <= reply["claim"] <= len(claims):
            verdicts[reply["claim"] - 1] = str(reply.get("verdict"))
    return verdicts


def answer_pass(questions: list[dict], retrieved: dict[str, list[dict]], course_id: str, web: str, delay: float, eval_key: str, judge_key: str | None) -> dict:
    outcomes = []
    for i, q in enumerate(questions):
        if i:
            time.sleep(delay)
        started = time.perf_counter()
        # The key lifts the 20-questions-a-day limit that anonymous visitors get.
        status, body = post(f"{web}/api/ask", {"question": q["question"], "courseId": course_id}, {"x-eval-key": eval_key})
        seconds = time.perf_counter() - started
        data = body.get("data") or {}
        # The passages this very answer was written from (the app returns them to eval runs). A separate
        # retrieval call can be reranked differently, so only these may be used to judge the answer.
        given = data.get("evalSegments") or retrieved[q["question"]]
        gold_ids = {s["id"] for s in given if q["covered"] and overlaps(s, q)}
        # Where each citation of a gold segment sends the viewer: `after` is the moment the app picks inside the
        # segment, `before` is the segment's start, which is where citations pointed until sentence-level landing.
        segment_start = {s["segmentId"]: s["startS"] for s in data.get("sources", [])}
        landings = [
            {"before": seconds_from_span(segment_start[c["segmentId"]], q["gold_start_s"], q["gold_end_s"]),
             "after": seconds_from_span(c["seconds"], q["gold_start_s"], q["gold_end_s"])}
            for c in data.get("citations", []) if c["segmentId"] in gold_ids and c["segmentId"] in segment_start
        ]
        outcomes.append({
            "question": q["question"],
            "covered": q["covered"],
            "http": status,
            "answered": bool(data.get("covered")),
            "said_not_covered": status == 200 and not data.get("covered"),
            "unverifiable": status == 502 and "verify" in body.get("error", ""),
            "cites_gold": any(c["segmentId"] in gold_ids for c in data.get("citations", [])),
            "landings": landings,
            # Faithfulness: each cited sentence against the passage it cites, judged by a different model.
            "claims": judge_answer(
                q["question"], claims_of(data.get("answer", ""), data.get("citations", [])),
                {s["id"]: s["transcript"] for s in given}, judge_key,
            ) if judge_key and data.get("covered") else [],
            "model": data.get("model"),
            "seconds": round(seconds, 2),
        })
        print(f"  {i + 1:>3}/{len(questions)} {status} {seconds:5.1f}s {'answered' if outcomes[-1]['answered'] else 'not covered' if outcomes[-1]['said_not_covered'] else 'ERROR':11s} {q['question'][:70]}")

    covered = [o for o in outcomes if o["covered"]]
    uncovered = [o for o in outcomes if not o["covered"]]
    generated = [o for o in outcomes if o["answered"] or o["unverifiable"]]
    answered_covered = [o for o in covered if o["answered"]]
    seconds = [o["seconds"] for o in outcomes]
    landings = [landing for o in outcomes for landing in o["landings"]]
    claims = [verdict for o in outcomes for verdict in o["claims"] if verdict != "unknown"]
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
        # Faithfulness, judged by a second model: cited sentences that their cited passage supports.
        "claims_judged": len(claims),
        "claims_supported": share([c for c in claims if c == "supported"], claims),
        "claims_supported_or_partly": share([c for c in claims if c in ("supported", "partly")], claims),
        "claims_unsupported": share([c for c in claims if c == "unsupported"], claims),
        # Citations of a gold segment: do they land inside the passage that answers the question?
        "citations_of_gold_segments": len(landings),
        "landing_inside_gold_span_before": share([x for x in landings if x["before"] == 0], landings),
        "landing_inside_gold_span_after": share([x for x in landings if x["after"] == 0], landings),
        "landing_mean_s_from_gold_span_before": statistics.mean(x["before"] for x in landings) if landings else None,
        "landing_mean_s_from_gold_span_after": statistics.mean(x["after"] for x in landings) if landings else None,
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
    parser.add_argument("--subset", type=int, default=0, metavar="N", help="use only a fixed N-question subset (for CI)")
    parser.add_argument("--baseline", type=Path, help="fail if recall@3 is more than 3 points below this file's value")
    parser.add_argument("--web", default="http://localhost:3000")
    parser.add_argument("--delay", type=float, default=SECONDS_BETWEEN_ANSWERS, help="seconds between /api/ask calls")
    parser.add_argument("--env", type=Path, default=ROOT / ".env", help="settings file: which Supabase project (and keys) to run against")
    parser.add_argument("--out", type=Path, default=ROOT / "evals" / "results.json", help="where a full run records its results")
    parser.add_argument("--served", action="store_true", help="also measure retrieval as the app serves it, after reranking")
    parser.add_argument("--check-gold", action="store_true", help="have a second model check each gold passage against its question")
    parser.add_argument("--review-sheet", type=int, default=0, metavar="N", help="write evals/review_sheet.md with N questions for a person to check")
    args = parser.parse_args()

    questions = [json.loads(line) for line in args.questions.read_text().splitlines() if line.strip()]
    if args.subset:
        questions = pick_subset(questions, args.subset)
    env = read_env(args.env)
    if args.review_sheet:
        sheet = ROOT / "evals" / "review_sheet.md"
        write_review_sheet(questions, args.review_sheet, args.course_id, env, sheet)
        print(f"written to {sheet.relative_to(ROOT)}")
        return

    print(f"retrieval over {len(questions)} questions…")
    retrieval, retrieved = retrieval_pass(questions, lambda text: retrieve(text, args.course_id, env))
    results = {"retrieval": retrieval}
    for name, value in retrieval.items():
        if name != "misses":
            print(f"  {name:38s} {value:.3f}" if isinstance(value, float) else f"  {name:38s} {value}")
    print(f"  not retrieved in the top {TOP_K}: {len(retrieval['misses'])}")

    if args.served:
        print(f"retrieval as served (search, then the reranker) over {len(questions)} questions…")
        served, retrieved = retrieval_pass(
            questions, lambda text: retrieve_served(text, args.course_id, args.web, env["SUPABASE_SERVICE_ROLE_KEY"])
        )
        results["retrieval_served"] = served
        for name, value in served.items():
            if name != "misses":
                print(f"  {name:38s} {value:.3f}" if isinstance(value, float) else f"  {name:38s} {value}")

    if args.answers:
        subset = pick_subset(questions, args.answers)
        print(f"asking {len(subset)} questions end to end ({args.delay:.0f} s apart)…")
        results["answers"] = answer_pass(
            subset, retrieved, args.course_id, args.web, args.delay, env["SUPABASE_SERVICE_ROLE_KEY"],
            # The judge's key lives in the local .env even when the run is pointed at another project.
            env.get("GEMINI_API_KEY") or read_env(ROOT / ".env").get("GEMINI_API_KEY"),
        )
        for name, value in results["answers"].items():
            if name != "outcomes":
                print(f"  {name:38s} {value:.3f}" if isinstance(value, float) else f"  {name:38s} {value}")

    if args.check_gold:
        print("checking gold passages with a second model…")
        results["gold_check"] = check_gold(questions, args.course_id, {**read_env(ROOT / ".env"), **env})
        for name, value in results["gold_check"].items():
            if name != "to_review":
                print(f"  {name:38s} {value}")

    if args.baseline:
        baseline = json.loads(args.baseline.read_text())["recall_at_3"]
        drop = baseline - retrieval["recall_at_3"]
        print(f"recall@3 {retrieval['recall_at_3']:.3f} against a baseline of {baseline:.3f}")
        if drop > MAX_RECALL_DROP:
            raise SystemExit(f"FAIL: recall@3 dropped by {drop * 100:.1f} points (more than {MAX_RECALL_DROP * 100:.0f} allowed)")
    if args.subset:
        return  # a subset run leaves the recorded full results alone

    # A run that skipped the slow passes keeps what an earlier run recorded for them.
    previous = json.loads(args.out.read_text()) if args.out.exists() else {}
    args.out.write_text(json.dumps({**previous, **results}, indent=1, ensure_ascii=False) + "\n")
    print(f"written to {args.out}")


if __name__ == "__main__":
    main()
