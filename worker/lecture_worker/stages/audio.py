import subprocess

from lecture_worker import r2
from lecture_worker.job import Job


def run(job: Job) -> None:
    out = job.dir / "audio.mp3"
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(job.src), "-vn", "-ac", "1", "-ar", "16000",
         "-c:a", "libmp3lame", "-b:a", "48k", str(out)],
        check=True,
    )
    r2.upload(out, job.key("audio.mp3"))
