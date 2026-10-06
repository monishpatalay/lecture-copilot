import base64
import io
import json
import os

from openai import APIConnectionError, APIStatusError, OpenAI
from PIL import Image

from lecture_worker import db, r2
from lecture_worker.job import Job

# The larger model reads boards and formulas better but is often overloaded on the free tier (503 "high
# demand" for minutes at a time). One busy model must not fail an upload, so the lite model is the fallback.
MODELS = ("gemini-3.8-flash", "gemini-3.5-flash-lite")
MAX_WIDTH = 768  # keeps the single request well under Gemini's inline-size limit

PROMPT = (
    "These are frames from one lecture video, in order. For each frame, transcribe the text visible on the "
    "slide or board. Write formulas as plain text (e.g. O(n log n), x^2 + 1). If a frame has no readable "
    'text, use an empty string. Reply with JSON only: {"slides": [{"index": <frame number>, "text": "..."}]}'
)


def _data_uri(path) -> str:
    img = Image.open(path).convert("RGB")
    img.thumbnail((MAX_WIDTH, MAX_WIDTH))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=70)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def run(job: Job) -> None:
    slides = json.loads((job.dir / "slides.json").read_text())

    content: list[dict] = [{"type": "text", "text": PROMPT}]
    for i, s in enumerate(slides):
        content.append({"type": "text", "text": f"Frame {i}:"})
        content.append({"type": "image_url", "image_url": {"url": _data_uri(job.dir / "slides" / s["file"])}})

    client = OpenAI(
        api_key=os.environ["GEMINI_API_KEY"],
        base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        max_retries=3,  # the SDK backs off between tries
    )
    for model in MODELS:
        try:
            response = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": content}],
                response_format={"type": "json_object"},
            )
            break
        except (APIStatusError, APIConnectionError) as error:
            overloaded = not isinstance(error, APIStatusError) or error.status_code == 429 or error.status_code >= 500
            if not overloaded or model == MODELS[-1]:
                raise
            print(f"{model} is unavailable ({error}); trying {MODELS[-1]}", flush=True)
    texts = {item["index"]: item["text"] for item in json.loads(response.choices[0].message.content)["slides"]}
    slides = [{**s, "text": texts.get(i, "")} for i, s in enumerate(slides)]

    out = job.dir / "slides.json"
    out.write_text(json.dumps(slides, ensure_ascii=False))
    r2.upload(out, job.key("slides.json"))

    with db.conn().transaction():
        db.conn().execute("delete from slides where lecture_id = %s", [job.lecture_id])
        db.conn().cursor().executemany(
            "insert into slides (lecture_id, t_s, image_key, text) values (%s, %s, %s, %s)",
            [(job.lecture_id, s["t_s"], s["image_key"], s["text"]) for s in slides],
        )
