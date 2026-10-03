"""Run every pipeline stage for one local video.

    uv run python -m lecture_worker.process video.mp4 --course-id <uuid> --number 4 --title "Hashing"

Each finished stage leaves `<stage>.done` in worker/data/<lecture_id>/, so a rerun resumes where it failed.
"""
import argparse
from pathlib import Path

from lecture_worker import db
from lecture_worker.job import InvalidVideo, Job
from lecture_worker.stages import audio, chunk, embed, slide_text, slides, transcode, transcribe, validate

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

# (name, run, progress % once finished)
STAGES = [
    ("validate", validate.run, 5),
    ("audio", audio.run, 10),
    ("transcribe", transcribe.run, 40),
    ("slides", slides.run, 50),
    ("slide_text", slide_text.run, 60),
    ("transcode", transcode.run, 85),
    ("chunk", chunk.run, 90),
    ("embed", embed.run, 100),
]


def run_stages(job: Job) -> None:
    for name, run, progress in STAGES:
        marker = job.dir / f"{name}.done"
        if marker.exists():
            print(f"· {name}: already done, skipping")
            continue
        print(f"▶ {name}")
        db.update_lecture(job.lecture_id, stage=name)
        run(job)
        marker.touch()
        db.update_lecture(job.lecture_id, progress=progress)


def run_lecture(job: Job) -> None:
    """Runs the stages that are still missing, then marks the lecture ready."""
    job.dir.mkdir(parents=True, exist_ok=True)
    run_stages(job)
    db.update_lecture(job.lecture_id, status="ready", stage=None)


def failure_message(error: Exception) -> str:
    """What the instructor sees on a failed lecture. The full traceback stays in the worker's output."""
    if isinstance(error, InvalidVideo):
        return str(error)
    return "Something went wrong while processing this lecture. Retry it; if it fails again, check the worker's log."


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("video", type=Path)
    parser.add_argument("--course-id", required=True)
    parser.add_argument("--number", required=True, type=int)
    parser.add_argument("--title", required=True)
    args = parser.parse_args()
    if not args.video.is_file():
        parser.error(f"{args.video} is not a file")

    # Same course + number resumes the existing lecture instead of creating a duplicate.
    lecture_id = str(db.conn().execute(
        """insert into lectures (course_id, number, title, status)
           values (%s, %s, %s, 'processing')
           on conflict (course_id, number) do update
             set title = excluded.title, status = 'processing', error = null
           returning id""",
        [args.course_id, args.number, args.title],
    ).fetchone()[0])

    print(f"lecture {lecture_id}")
    try:
        run_lecture(Job(lecture_id=lecture_id, src=args.video.resolve(), dir=DATA_DIR / lecture_id))
    except Exception as e:
        db.update_lecture(lecture_id, status="failed", error=failure_message(e))
        raise
    print("✓ ready")


if __name__ == "__main__":
    main()
