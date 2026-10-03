import json
import subprocess

from lecture_worker import db
from lecture_worker.job import Job

MAX_BYTES = 2 * 1024**3
MAX_SECONDS = 3 * 3600
EXTENSIONS = {".mp4", ".mov", ".webm"}
CONTAINERS = {"mp4", "mov", "webm"}  # ffprobe reports e.g. "mov,mp4,m4a,3gp,3g2,mj2" or "matroska,webm"


def run(job: Job) -> None:
    if job.src.suffix.lower() not in EXTENSIONS:
        raise ValueError(f"Unsupported file type {job.src.suffix!r}: use MP4, MOV, or WebM")
    if job.src.stat().st_size > MAX_BYTES:
        raise ValueError("File is larger than 2 GB")

    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(job.src)],
        capture_output=True, text=True,
    )
    if probe.returncode != 0:
        raise ValueError(f"Not a readable video: {probe.stderr.strip()[:200]}")
    info = json.loads(probe.stdout)

    if not CONTAINERS & set(info["format"]["format_name"].split(",")):
        raise ValueError(f"Unsupported container {info['format']['format_name']!r}")
    kinds = {s["codec_type"] for s in info["streams"]}
    if not {"video", "audio"} <= kinds:
        raise ValueError("Video must have both a video and an audio track")
    duration = float(info["format"]["duration"])
    if duration > MAX_SECONDS:
        raise ValueError("Video is longer than 3 hours")

    db.update_lecture(job.lecture_id, duration_s=duration)
