"""Run every pipeline stage for one local video.

    uv run python -m lecture_worker.process video.mp4 --course-id <uuid> --number 4 --title "Hashing"

Each finished stage leaves `<stage>.done` in worker/data/<lecture_id>/, so a rerun resumes where it failed.
"""
import argparse
from pathlib import Path

from lecture_worker import db
from lecture_worker.job import Job
from lecture_worker.stages import audio, slide_text, slides, transcribe, validate

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

# (name, run, progress % once finished)
STAGES = [
    ("validate", validate.run, 5),
    ("audio", audio.run, 10),
    ("transcribe", transcribe.run, 40),
    ("slides", slides.run, 50),
    ("slide_text", slide_text.run, 60),
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

    job = Job(lecture_id=lecture_id, src=args.video.resolve(), dir=DATA_DIR / lecture_id)
    job.dir.mkdir(parents=True, exist_ok=True)
    print(f"lecture {lecture_id}")
    try:
        run_stages(job)
    except Exception as e:
        db.update_lecture(lecture_id, status="failed", error=str(e)[:500])
        raise
    # ponytail: status stays 'processing' until the final stage exists (step 5 sets 'ready').


if __name__ == "__main__":
    main()
