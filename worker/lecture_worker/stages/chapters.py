import json
import os

from openai import OpenAI
from psycopg.types.json import Json

from lecture_worker import db, r2
from lecture_worker.job import Job

MODEL = "gemini-3.5-flash-lite"  # titles are an easy task, and the lite model is rarely overloaded
MAX_TITLE_CHARS = 60

PROMPT = (
    "Below is a lecture transcript split into segments, each starting with its start time in seconds. "
    "Divide the lecture into 6 to 10 chapters. A chapter starts where the lecturer moves to a new topic. "
    "Give each chapter a short title of at most 6 words, in the lecturer's own terms. "
    'Reply with JSON only: {"chapters": [{"t_s": <start time of the segment where the chapter begins>, "title": "..."}]}'
)


def clean_chapters(raw: object, segment_starts: list[float]) -> list[dict]:
    """Keeps only chapters that start at a real segment, in time order, one per start time.

    The model's reply is untrusted: anything malformed is dropped rather than shown to students.
    """
    starts = set(segment_starts)
    chapters: dict[float, str] = {}
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        t_s, title = item.get("t_s"), item.get("title")
        if isinstance(t_s, (int, float)) and not isinstance(t_s, bool) and t_s in starts and isinstance(title, str) and title.strip():
            chapters.setdefault(float(t_s), title.strip()[:MAX_TITLE_CHARS])
    return [{"t_s": t_s, "title": title} for t_s, title in sorted(chapters.items())]


def run(job: Job) -> None:
    chunks = json.loads((job.dir / "chunks.json").read_text())
    # The opening of each segment is enough to tell what it is about.
    listing = "\n".join(f"[{c['start_s']}] {c['transcript'][:400]}" for c in chunks)

    client = OpenAI(
        api_key=os.environ["GEMINI_API_KEY"],
        base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        max_retries=6,
    )
    response = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": f"{PROMPT}\n\n{listing}"}],
        response_format={"type": "json_object"},
    )
    reply = json.loads(response.choices[0].message.content)
    chapters = clean_chapters(reply.get("chapters") if isinstance(reply, dict) else None, [c["start_s"] for c in chunks])

    out = job.dir / "chapters.json"
    out.write_text(json.dumps(chapters, ensure_ascii=False))
    r2.upload(out, job.key("chapters.json"))
    db.update_lecture(job.lecture_id, chapters=Json(chapters))
