import json

from lecture_worker import r2
from lecture_worker.job import Job

MIN_SECONDS = 60
MAX_SECONDS = 90
SENTENCE_END = (".", "?", "!")


def chunk_transcript(transcript: list[dict], slides: list[dict]) -> list[dict]:
    """Merge consecutive transcript segments into 60–90 s windows that end on a sentence when possible.

    transcript: [{start, end, text}] in order. slides: [{t_s, text}] in order.
    Each window carries the text of every slide on screen during it.
    """
    windows: list[list[dict]] = []
    current: list[dict] = []
    for seg in transcript:
        if current and seg["end"] - current[0]["start"] > MAX_SECONDS:
            windows.append(current)  # no sentence end came in time: hard break
            current = []
        current.append(seg)
        long_enough = seg["end"] - current[0]["start"] >= MIN_SECONDS
        if long_enough and seg["text"].rstrip().endswith(SENTENCE_END):
            windows.append(current)
            current = []
    if current:
        windows.append(current)

    chunks = []
    for window in windows:
        start, end = window[0]["start"], window[-1]["end"]
        # On screen during the window: the slide already up at `start`, plus any that appear before `end`.
        up_at_start = [s for s in slides if s["t_s"] <= start][-1:]
        appearing = [s for s in slides if start < s["t_s"] < end]
        slide_text = "\n\n".join(s["text"] for s in up_at_start + appearing if s["text"])
        chunks.append({
            "start_s": start,
            "end_s": end,
            "transcript": " ".join(s["text"] for s in window),
            "slide_text": slide_text,
        })
    return chunks


def run(job: Job) -> None:
    transcript = json.loads((job.dir / "transcript.json").read_text())
    slides = json.loads((job.dir / "slides.json").read_text())
    out = job.dir / "chunks.json"
    out.write_text(json.dumps(chunk_transcript(transcript, slides), ensure_ascii=False))
    r2.upload(out, job.key("chunks.json"))
