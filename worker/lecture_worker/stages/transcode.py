import subprocess
import time

from lecture_worker import db, r2
from lecture_worker.job import Job

COMMON_OUT = ["-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart"]
SCALE = ["-vf", "scale=-2:'min(720,ih)'"]  # never upscale
# VideoToolbox has no CRF; -q:v is its constant-quality knob (higher = better, ~CRF 28 visually for slides).
HARDWARE = ["-c:v", "h264_videotoolbox", "-q:v", "45"]
SOFTWARE = ["-c:v", "libx264", "-crf", "28", "-preset", "veryfast", "-pix_fmt", "yuv420p"]

# This stage takes a lecture from 60% to 85% (see STAGES in process.py) and is the longest one: twelve
# minutes for a 75-minute video on the cloud worker. Without updates in between, the bar looks stuck.
PROGRESS_FROM, PROGRESS_TO = 60, 85
REPORT_EVERY_SECONDS = 5


def seconds_encoded(line: str) -> float | None:
    """ffmpeg -progress prints key=value lines; `out_time_us` is how much of the video is done, in microseconds."""
    key, _, value = line.strip().partition("=")
    if key != "out_time_us" or not value.lstrip("-").isdigit():
        return None  # other keys, and "N/A" before the first frame
    return max(0, int(value)) / 1_000_000


def progress_at(encoded_s: float, duration_s: float) -> int:
    share = min(1.0, encoded_s / duration_s) if duration_s > 0 else 0.0
    return PROGRESS_FROM + int((PROGRESS_TO - PROGRESS_FROM) * share)


def encode(command: list[str], job: Job, duration_s: float) -> None:
    """Runs ffmpeg and keeps the lecture's progress moving. Raises CalledProcessError like subprocess.run(check=True)."""
    process = subprocess.Popen([*command[:-1], "-progress", "pipe:1", "-nostats", command[-1]], stdout=subprocess.PIPE, text=True)
    reported_at, reported = 0.0, PROGRESS_FROM
    for line in process.stdout:
        encoded = seconds_encoded(line)
        if encoded is None or time.monotonic() - reported_at < REPORT_EVERY_SECONDS:
            continue
        progress = progress_at(encoded, duration_s)
        if progress != reported:
            db.update_lecture(job.lecture_id, progress=progress)
            reported = progress
        reported_at = time.monotonic()
    if process.wait() != 0:
        raise subprocess.CalledProcessError(process.returncode, command)


def run(job: Job) -> None:
    out = job.dir / "video.mp4"
    (duration_s,) = db.conn().execute("select coalesce(duration_s, 0) from lectures where id = %s", [job.lecture_id]).fetchone()
    base = ["ffmpeg", "-y", "-v", "error", "-i", str(job.src), *SCALE]
    try:
        encode([*base, *HARDWARE, *COMMON_OUT, str(out)], job, duration_s)
    except subprocess.CalledProcessError:
        print("  videotoolbox failed, falling back to libx264")
        encode([*base, *SOFTWARE, *COMMON_OUT, str(out)], job, duration_s)

    key = job.key("video.mp4")
    r2.upload(out, key)
    db.update_lecture(job.lecture_id, video_key=key)
