import json
import os

from openai import APIConnectionError, APIStatusError, OpenAI
from psycopg.types.json import Json

from lecture_worker import db, r2
from lecture_worker.job import Job

# Titles are an easy task. Gemini's lite model goes first; its free tier has a daily request limit that a busy
# day uses up, so Groq is the stand-in. (base URL, key variable, model)
PROVIDERS = (
    ("https://generativelanguage.googleapis.com/v1beta/openai/", "GEMINI_API_KEY", "gemini-3.5-flash-lite"),
    ("https://api.groq.com/openai/v1", "GROQ_API_KEY", "openai/gpt-oss-120b"),
)
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

    # Chapters are a nicety on the lecture page. If neither provider can write them, the lecture goes ahead
    # without: failing a whole upload over its chapter titles would be the wrong trade.
    chapters: list[dict] = []
    for base_url, key_name, model in PROVIDERS:
        try:
            client = OpenAI(api_key=os.environ[key_name], base_url=base_url, max_retries=2, timeout=90)
            text = client.chat.completions.create(
                model=model, messages=[{"role": "user", "content": f"{PROMPT}\n\n{listing}"}]
            ).choices[0].message.content or ""
            reply = json.loads(text[text.index("{"): text.rindex("}") + 1])  # tolerate a fenced or prefixed reply
            chapters = clean_chapters(reply.get("chapters") if isinstance(reply, dict) else None, [c["start_s"] for c in chunks])
            break
        except (APIStatusError, APIConnectionError, ValueError, KeyError) as error:
            print(f"  chapters: {model} didn't work ({str(error)[:120]})", flush=True)
    else:
        print("  chapters: no provider available; continuing without chapters", flush=True)

    out = job.dir / "chapters.json"
    out.write_text(json.dumps(chapters, ensure_ascii=False))
    r2.upload(out, job.key("chapters.json"))
    db.update_lecture(job.lecture_id, chapters=Json(chapters))
