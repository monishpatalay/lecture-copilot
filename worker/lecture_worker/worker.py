"""Queue loop: claims queued lectures from Postgres and runs the pipeline on them.

    uv run python -m lecture_worker.worker

Postgres is the queue. Several workers may run at once: FOR UPDATE SKIP LOCKED gives each queued lecture to one of them.
"""
import os
import socket
import threading
import time
import traceback
from pathlib import Path

import psycopg

from lecture_worker import db, r2
from lecture_worker.job import InvalidVideo, Job
from lecture_worker.process import DATA_DIR, failure_message, run_lecture

POLL_SECONDS = 5
HEARTBEAT_SECONDS = 15  # the web app calls the worker offline after 60 s of silence
STALE_LOCK = "2 hours"  # a lecture `processing` for this long was abandoned by a worker that died

CLAIM = """
    update lectures set status = 'processing', locked_at = now()
    where id = (
        select id from lectures
        where status = 'queued'
        order by created_at
        for update skip locked
        limit 1
    )
    returning id, raw_key
"""


def claim(conn: psycopg.Connection) -> tuple[str, str | None] | None:
    """Takes the oldest queued lecture for this worker, or returns None when the queue is empty."""
    row = conn.execute(CLAIM).fetchone()
    return (str(row[0]), row[1]) if row else None


def requeue_stale(conn: psycopg.Connection) -> int:
    """Puts lectures back in the queue when their worker has held them for too long. Returns how many."""
    return conn.execute(
        """update lectures set status = 'queued', locked_at = null
           where status = 'processing' and locked_at < now() - %s::interval""",
        [STALE_LOCK],
    ).rowcount


def beat_forever(worker_id: str) -> None:
    # Its own connection: the main one is busy inside long statements, and connections aren't shared across threads.
    with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True) as conn:
        while True:
            conn.execute(
                """insert into worker_heartbeats (worker_id) values (%s)
                   on conflict (worker_id) do update set last_seen_at = now()""",
                [worker_id],
            )
            time.sleep(HEARTBEAT_SECONDS)


def fetch_raw(lecture_id: str, raw_key: str) -> Path:
    """Downloads the uploaded video once. A retry after a failed stage reuses the local copy."""
    path = DATA_DIR / lecture_id / f"raw{Path(raw_key).suffix}"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        partial = path.with_name(path.name + ".part")  # so an interrupted download is never mistaken for the file
        r2.download(raw_key, partial)
        partial.rename(path)
    return path


def work(lecture_id: str, raw_key: str | None) -> None:
    print(f"lecture {lecture_id}")
    try:
        if not raw_key:
            raise InvalidVideo("This lecture has no uploaded video. Upload it again.")
        src = fetch_raw(lecture_id, raw_key)
        run_lecture(Job(lecture_id=lecture_id, src=src, dir=DATA_DIR / lecture_id))
    except KeyboardInterrupt:
        # Stopped by hand mid-lecture: put it back so the next start resumes it.
        db.update_lecture(lecture_id, status="queued", locked_at=None)
        raise
    except Exception as e:
        traceback.print_exc()
        db.update_lecture(lecture_id, status="failed", error=failure_message(e))
        return

    # The streamable copy is in R2 now, so the raw upload isn't needed anywhere.
    r2.delete(raw_key)
    src.unlink()
    db.update_lecture(lecture_id, raw_key=None, locked_at=None)
    print("✓ ready")


def main() -> None:
    worker_id = socket.gethostname()
    threading.Thread(target=beat_forever, args=[worker_id], daemon=True).start()
    print(f"worker {worker_id}: waiting for lectures (Ctrl+C to stop)")
    conn = db.conn()
    try:
        while True:
            if requeued := requeue_stale(conn):
                print(f"requeued {requeued} lecture(s) whose worker went away")
            claimed = claim(conn)
            if claimed:
                work(*claimed)
            else:
                time.sleep(POLL_SECONDS)
    except KeyboardInterrupt:
        print("\nstopped")


if __name__ == "__main__":
    main()
