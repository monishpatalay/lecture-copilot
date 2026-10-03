import subprocess

from lecture_worker import db, r2
from lecture_worker.job import Job

COMMON_OUT = ["-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart"]
SCALE = ["-vf", "scale=-2:'min(720,ih)'"]  # never upscale
# VideoToolbox has no CRF; -q:v is its constant-quality knob (higher = better, ~CRF 28 visually for slides).
HARDWARE = ["-c:v", "h264_videotoolbox", "-q:v", "45"]
SOFTWARE = ["-c:v", "libx264", "-crf", "28", "-preset", "veryfast", "-pix_fmt", "yuv420p"]


def run(job: Job) -> None:
    out = job.dir / "video.mp4"
    base = ["ffmpeg", "-y", "-v", "error", "-i", str(job.src), *SCALE]
    try:
        subprocess.run([*base, *HARDWARE, *COMMON_OUT, str(out)], check=True)
    except subprocess.CalledProcessError:
        print("  videotoolbox failed, falling back to libx264")
        subprocess.run([*base, *SOFTWARE, *COMMON_OUT, str(out)], check=True)

    key = job.key("video.mp4")
    r2.upload(out, key)
    db.update_lecture(job.lecture_id, video_key=key)
    # Phase 2: delete the raw upload from R2 here (the CLI reads the raw file from local disk).
