"""Train a small cross-encoder reranker and compare it with the app's LLM reranker on the eval set.

Run from worker/ (its environment has PyTorch), one step at a time; each step caches its output in evals/rerank/:

    uv run python ../evals/reranker.py synth        # ~10 Gemini calls: 2 training questions per segment
    uv run python ../evals/reranker.py candidates   # search's top 12 for every eval and training question
    uv run python ../evals/reranker.py llm          # 120 calls: the app's LLM reranker on the same candidates
    uv run python ../evals/reranker.py bench        # fine-tune with each lecture held out in turn, then score

Each lecture is held out in turn: the model trains on the other two lectures' eval questions plus the synthetic
questions written from those lectures, and is scored only on the held-out lecture's eval questions.
"""
import argparse
import json
import random
import time
import urllib.request
from pathlib import Path

from run_eval import (
    DEMO_COURSE, GEMINI_URL, ROOT, first_hit_rank, judge, mean_reciprocal_rank, percentile, read_env, recall_at, retrieve,
)

OUT = ROOT / "evals" / "rerank"
CANDIDATES, KEEP = 12, 6  # as in web/lib/rerank.ts
PASSAGE_CHARS = 1200  # as in web/lib/rerank.ts
LLM_MODEL, LLM_CAP_S = "gemini-3.1-flash-lite", 3.0  # the app's reranker and its timeout
BASE_MODEL = "cross-encoder/ms-marco-MiniLM-L6-v2"
# Fixed before looking at any held-out score; tuning them on the test folds would leak.
EPOCHS, LR, SEED = 2, 2e-5, 0
SYNTH_BATCH = 16


# ── pure helpers (tested in test_reranker.py) ────────────────────────────

def parse_ranking(reply: str, count: int) -> list[int] | None:
    """Port of parseRanking in web/lib/rerank.ts: 0-based picks from a reply like "[3, 1, 7]"."""
    start, end = reply.find("["), reply.find("]")
    if start < 0 or end < start:
        return None
    try:
        numbers = json.loads(reply[start: end + 1])
    except ValueError:
        return None
    picked = [n - 1 for n in numbers if isinstance(n, int) and 1 <= n <= count]
    return list(dict.fromkeys(picked))


def apply_order(segments: list, picked: list[int] | None) -> list:
    """The app's rule: the model's picks first, then whatever it left out in search order, cut to six."""
    picked = picked or []
    return [segments[i] for i in picked + [i for i in range(len(segments)) if i not in picked]][:KEEP]


def folds(eval_qs: list[dict], synth_qs: list[dict]):
    """(held-out lecture, training questions, test questions) for each lecture."""
    for lecture in sorted({q["lecture_no"] for q in eval_qs}):
        train = [q for q in eval_qs + synth_qs if q["lecture_no"] != lecture]
        yield lecture, train, [q for q in eval_qs if q["lecture_no"] == lecture]


def metrics(ranked: dict[str, list[dict]], questions: list[dict]) -> dict:
    ranks = [first_hit_rank(ranked[q["question"]], q) for q in questions]
    return {"recall_at_1": recall_at(ranks, 1), "recall_at_3": recall_at(ranks, 3), "recall_at_6": recall_at(ranks, 6),
            "mrr": mean_reciprocal_rank(ranks)}


# ── steps ────────────────────────────────────────────────────────────────

def load_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def covered_eval() -> list[dict]:
    return [q for q in load_jsonl(ROOT / "evals" / "questions.jsonl") if q["covered"]]


def course_segments(env: dict[str, str]) -> list[dict]:
    base, key = env["NEXT_PUBLIC_SUPABASE_URL"], env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
    query = f"select=start_s,end_s,transcript,lectures!inner(number,course_id)&lectures.course_id=eq.{DEMO_COURSE}&order=start_s"
    request = urllib.request.Request(f"{base}/rest/v1/segments?{query}", headers={"apikey": key, "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def synth(env: dict[str, str], gemini_key: str) -> None:
    segments = course_segments(env)
    written = []
    for i in range(0, len(segments), SYNTH_BATCH):
        batch = segments[i: i + SYNTH_BATCH]
        passages = "\n\n".join(f"[{n}] {s['transcript']}" for n, s in enumerate(batch, 1))
        prompt = (
            "Below are numbered passages from a lecture transcript. For each passage write 2 questions a student might ask "
            "that this passage answers. Phrase them the way a student would, without quoting the passage word for word. "
            'Reply with only a JSON array like [{"n": 1, "questions": ["...", "..."]}].\n\n' + passages
        )
        for item in judge(prompt, gemini_key):
            if not (isinstance(item, dict) and isinstance(item.get("n"), int) and 1 <= item["n"] <= len(batch)):
                continue
            s = batch[item["n"] - 1]
            for text in item.get("questions", [])[:2]:
                if isinstance(text, str) and text.strip():
                    written.append({"question": text.strip(), "lecture_no": s["lectures"]["number"],
                                    "gold_start_s": s["start_s"], "gold_end_s": s["end_s"], "covered": True})
        print(f"  {min(i + SYNTH_BATCH, len(segments))}/{len(segments)} segments, {len(written)} questions")
        time.sleep(5)
    (OUT / "synthetic.jsonl").write_text("".join(json.dumps(q) + "\n" for q in written))


def candidates(env: dict[str, str]) -> None:
    questions = covered_eval() + load_jsonl(OUT / "synthetic.jsonl")
    path = OUT / "candidates.json"
    cached = json.loads(path.read_text()) if path.exists() else {}
    for n, q in enumerate(questions, 1):
        if q["question"] not in cached:
            rows = retrieve(q["question"], DEMO_COURSE, env, CANDIDATES)
            cached[q["question"]] = [{k: r[k] for k in ("lecture_number", "start_s", "end_s", "transcript", "similarity")} for r in rows]
        if n % 50 == 0:
            path.write_text(json.dumps(cached))
            print(f"  {n}/{len(questions)}")
    path.write_text(json.dumps(cached))


def llm(gemini_key: str) -> None:
    """The exact prompt of web/lib/rerank.ts, without the 3 s cap, so the full latency is seen."""
    cands = json.loads((OUT / "candidates.json").read_text())
    path = OUT / "llm.json"
    done = json.loads(path.read_text()) if path.exists() else {}
    for q in covered_eval():
        if q["question"] in done:
            continue
        segs = cands[q["question"]]
        passages = "\n\n".join(f"[{i + 1}] {s['transcript'][:PASSAGE_CHARS]}" for i, s in enumerate(segs))
        content = (f"A student asked: {q['question']}\n\nBelow are {len(segs)} passages from lecture transcripts. Pick the {KEEP} "
                   "passages most likely to contain the answer, best first. Reply with only a JSON array of their numbers, "
                   f"for example [3, 1, 7, 2, 9, 4].\n\n{passages}")
        request = urllib.request.Request(
            GEMINI_URL, data=json.dumps({"model": LLM_MODEL, "messages": [{"role": "user", "content": content}]}).encode(),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {gemini_key}"},
        )
        # The app tries once; retrying here shows the model's own quality, and `attempts` > 1 marks what the app would have skipped.
        for attempt in range(1, 5):
            started = time.perf_counter()
            try:
                with urllib.request.urlopen(request, timeout=60) as response:
                    reply = json.load(response)["choices"][0]["message"]["content"]
                done[q["question"]] = {"seconds": time.perf_counter() - started, "picked": parse_ranking(reply, len(segs)), "attempts": attempt}
                break
            except Exception as error:  # noqa: BLE001 — recorded as a failure, which the app treats as "search order"
                done[q["question"]] = {"seconds": time.perf_counter() - started, "picked": None, "attempts": attempt, "error": str(error)[:200]}
                time.sleep(10 * attempt)
        path.write_text(json.dumps(done, indent=1))
        print(f"  {len(done)}/120  {done[q['question']]['seconds']:.2f} s")
        time.sleep(4)  # about 15 a minute, the free tier's pace


def train(train_qs: list[dict], cands: dict[str, list[dict]]):
    """Listwise fine-tune: per question, softmax over its 12 candidates, maximise the mass on the right ones."""
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    random.seed(SEED)
    torch.manual_seed(SEED)
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    tok = AutoTokenizer.from_pretrained(BASE_MODEL)
    model = AutoModelForSequenceClassification.from_pretrained(BASE_MODEL).to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=LR)
    examples = []
    for q in train_qs:
        segs = cands[q["question"]]
        labels = [first_hit_rank([s], q) is not None for s in segs]
        if any(labels) and not all(labels):  # all-wrong or all-right lists teach nothing about order
            examples.append((q["question"], [s["transcript"] for s in segs], torch.tensor(labels)))
    model.train()
    for epoch in range(EPOCHS):
        random.shuffle(examples)
        total = 0.0
        for question, passages, labels in examples:
            batch = tok([question] * len(passages), passages, truncation=True, max_length=512, padding=True, return_tensors="pt").to(device)
            log_probs = model(**batch).logits.squeeze(-1).log_softmax(0)
            loss = -torch.logsumexp(log_probs[labels.to(device)], 0)
            opt.zero_grad()
            loss.backward()
            opt.step()
            total += loss.item()
        print(f"    epoch {epoch + 1}: {len(examples)} questions, mean loss {total / len(examples):.3f}")
    return model.to("cpu").eval(), tok


def score_all(model, tok, questions: list[dict], cands: dict[str, list[dict]]) -> tuple[dict, list[float]]:
    """Reranked top six per question, and the seconds each took on CPU (tokenise + forward for 12 pairs)."""
    import torch

    ranked, seconds = {}, []
    with torch.inference_mode():
        for n, q in enumerate([questions[0]] + questions):  # the first is a warm-up and not timed
            segs = cands[q["question"]]
            started = time.perf_counter()
            batch = tok([q["question"]] * len(segs), [s["transcript"] for s in segs], truncation=True, max_length=512, padding=True, return_tensors="pt")
            scores = model(**batch).logits.squeeze(-1).tolist()
            if n:
                seconds.append(time.perf_counter() - started)
                ranked[q["question"]] = [segs[i] for i in sorted(range(len(segs)), key=lambda i: -scores[i])][:KEEP]
    return ranked, seconds


def bench() -> None:
    cands = json.loads((OUT / "candidates.json").read_text())
    llm_path = OUT / "llm.json"
    llm_runs = json.loads(llm_path.read_text()) if llm_path.exists() else {}
    eval_qs, synth_qs = covered_eval(), load_jsonl(OUT / "synthetic.jsonl")

    rows: dict[str, dict] = {}
    rows["search order"] = {**metrics({q["question"]: cands[q["question"]][:KEEP] for q in eval_qs}, eval_qs)}
    if all(q["question"] in llm_runs for q in eval_qs):
        add_llm_rows(rows, eval_qs, cands, llm_runs)
    else:
        print(f"LLM reranker rows left out: llm.json has {len(llm_runs)} of {len(eval_qs)} questions (run the llm step)")
    cross_encoder_rows(rows, eval_qs, synth_qs, cands)


def add_llm_rows(rows: dict, eval_qs: list[dict], cands: dict, llm_runs: dict) -> None:
    llm_lat = [llm_runs[q["question"]]["seconds"] for q in eval_qs]
    rows["LLM reranker, no time limit"] = {
        **metrics({q["question"]: apply_order(cands[q["question"]], llm_runs[q["question"]]["picked"]) for q in eval_qs}, eval_qs),
        "p50_s": percentile(llm_lat, 50), "p95_s": percentile(llm_lat, 95),
        "failed": sum(llm_runs[q["question"]]["picked"] is None for q in eval_qs),
    }
    served_ok = lambda run: run["attempts"] == 1 and run["seconds"] <= LLM_CAP_S  # noqa: E731 — the app's single 3 s try
    capped = {q["question"]: apply_order(cands[q["question"]], llm_runs[q["question"]]["picked"] if served_ok(llm_runs[q["question"]]) else None) for q in eval_qs}
    rows[f"LLM reranker, {LLM_CAP_S:.0f} s limit (as served)"] = {
        **metrics(capped, eval_qs), "p50_s": percentile([min(s, LLM_CAP_S) for s in llm_lat], 50), "p95_s": percentile([min(s, LLM_CAP_S) for s in llm_lat], 95),
        "skipped": sum(not served_ok(llm_runs[q["question"]]) for q in eval_qs),
    }


def cross_encoder_rows(rows: dict, eval_qs: list[dict], synth_qs: list[dict], cands: dict) -> None:
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    print("pretrained cross-encoder (no fine-tuning)…")
    model = AutoModelForSequenceClassification.from_pretrained(BASE_MODEL).eval()
    ranked, seconds = score_all(model, AutoTokenizer.from_pretrained(BASE_MODEL), eval_qs, cands)
    rows["MiniLM cross-encoder, pretrained"] = {**metrics(ranked, eval_qs), "p50_s": percentile(seconds, 50), "p95_s": percentile(seconds, 95)}

    tuned, tuned_seconds, per_fold = {}, [], {}
    for lecture, train_qs, test_qs in folds(eval_qs, synth_qs):
        print(f"fold: lecture {lecture} held out, {len(train_qs)} training questions, {len(test_qs)} test questions")
        model, tok = train(train_qs, cands)
        ranked, seconds = score_all(model, tok, test_qs, cands)
        tuned |= ranked
        tuned_seconds += seconds
        per_fold[f"lecture {lecture}"] = metrics(ranked, test_qs)
    rows["MiniLM cross-encoder, fine-tuned"] = {**metrics(tuned, eval_qs), "p50_s": percentile(tuned_seconds, 50), "p95_s": percentile(tuned_seconds, 95)}

    print(f"\n{'':44s} R@1    R@3    R@6    MRR    p50 s  p95 s")
    for name, r in rows.items():
        lat = f"{r['p50_s']:.3f}  {r['p95_s']:.3f}" if "p50_s" in r else "    —      —"
        print(f"{name:44s} {r['recall_at_1']:.3f}  {r['recall_at_3']:.3f}  {r['recall_at_6']:.3f}  {r['mrr']:.3f}  {lat}")
    ceiling = sum(first_hit_rank(cands[q["question"]], q) is not None for q in eval_qs) / len(eval_qs)
    print(f"right passage anywhere in search's top {CANDIDATES} (the ceiling for any reranker): {ceiling:.3f}")
    (OUT / "results.json").write_text(json.dumps({
        "questions": len(eval_qs), "synthetic_training_questions": len(synth_qs), "ceiling_recall_at_12": ceiling,
        "base_model": BASE_MODEL, "epochs": EPOCHS, "lr": LR, "rows": rows, "fine_tuned_per_fold": per_fold,
    }, indent=1) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("step", choices=["synth", "candidates", "llm", "bench"])
    parser.add_argument("--env", type=Path, default=ROOT / ".env.production", help="Supabase project to read segments from")
    args = parser.parse_args()
    OUT.mkdir(exist_ok=True)
    env, gemini_key = read_env(args.env), read_env(ROOT / ".env").get("GEMINI_API_KEY", "")
    {"synth": lambda: synth(env, gemini_key), "candidates": lambda: candidates(env), "llm": lambda: llm(gemini_key), "bench": bench}[args.step]()


if __name__ == "__main__":
    main()
