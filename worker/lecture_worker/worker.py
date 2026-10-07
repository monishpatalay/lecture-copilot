"""Queue loop: claims queued lectures from Postgres and runs the pipeline on them.

    uv run python -m lecture_worker.worker          # keeps running (your Mac)
    uv run python -m lecture_worker.worker --once   # drains the queue and exits (GitHub Actions)

Postgres is the queue. Several workers may run at once: FOR UPDATE SKIP LOCKED gives each queued lecture to one of them.
"""
import argparse
import json
import os
import shutil
import socket
import threading
import time
import traceback
import urllib.request
from pathlib import Path

import psycopg

from lecture_worker import db, r2
from lecture_worker.job import InvalidVideo, Job
from lecture_worker.process import DATA_DIR, failure_message, run_lecture

POLL_SECONDS = 5
HEARTBEAT_SECONDS = 15  # the web app calls the worker offline after 60 s of silence
STALE_LOCK = "2 hours"  # a lecture `processing` for this long was abandoned by a worker that died
UPLOAD_EXPIRY = "24 hours"  # an upload still unfinished after this long was abandoned by its browser tab

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


def expire_abandoned_uploads(conn: psycopg.Connection) -> int:
    """Removes lectures whose upload was started but never finished, with any partial file. Returns how many."""
    rows = conn.execute(
        "select id, raw_key from lectures where status = 'uploading' and locked_at < now() - %s::interval",
        [UPLOAD_EXPIRY],
    ).fetchall()
    for lecture_id, raw_key in rows:
        # File first, row second: if storage is unreachable the row stays and the next loop tries again.
        if raw_key:
            r2.delete(raw_key)  # a no-op when the file never arrived
        conn.execute("delete from lectures where id = %s and status = 'uploading'", [lecture_id])
    return len(rows)


current_lecture: str | None = None  # what this worker is processing right now, for the heartbeat thread


def beat_forever(worker_id: str) -> None:
    # Its own connection: the main one is busy inside long statements, and connections aren't shared across threads.
    with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True) as conn:
        while True:
            conn.execute(
                """insert into worker_heartbeats (worker_id) values (%s)
                   on conflict (worker_id) do update set last_seen_at = now()""",
                [worker_id],
            )
            # Renew the lock on the lecture in hand, so stale-lock recovery only ever takes lectures
            # whose worker has really gone away, however long a live one takes.
            if current_lecture:
                conn.execute(
                    "update lectures set locked_at = now() where id = %s and status = 'processing'", [current_lecture]
                )
            time.sleep(HEARTBEAT_SECONDS)


def fetch_raw(lecture_id: str, raw_key: str) -> Path:
    """Downloads the uploaded video once. A retry after a failed stage reuses the local copy and its finished stages."""
    folder = DATA_DIR / lecture_id
    path = folder / Path(raw_key).name
    if not path.exists():
        # First sight of this upload. Every upload has its own file name, so whatever is in the folder
        # was made from a file that has since been replaced, and must not be reused.
        shutil.rmtree(folder, ignore_errors=True)
        folder.mkdir(parents=True)
        partial = path.with_name(path.name + ".part")  # so an interrupted download is never mistaken for the file
        r2.download(raw_key, partial)
        partial.rename(path)
    return path


def notify_ready(lecture_id: str) -> None:
    """Emails the course's professor that the lecture can be watched. Does nothing unless email is configured
    (RESEND_API_KEY, EMAIL_FROM and SITE_URL), and never lets a mail problem touch the lecture itself."""
    api_key, sender, site = (os.environ.get(name) for name in ("RESEND_API_KEY", "EMAIL_FROM", "SITE_URL"))
    if not (api_key and sender and site):
        return
    try:
        row = db.conn().execute(
            """select u.email, l.number, l.title, c.title
               from lectures l join courses c on c.id = l.course_id join auth.users u on u.id = c.instructor_id
               where l.id = %s""",
            [lecture_id],
        ).fetchone()
        if not row:
            return  # a course without an owner
        email, number, title, course = row
        link = f"{site.rstrip('/')}/lectures/{lecture_id}"
        request = urllib.request.Request(
            "https://api.resend.com/emails",
            data=json.dumps({
                "from": sender,
                "to": [email],
                "subject": f"Your lecture is ready: {title}",
                "text": f'Lecture {number}, "{title}", in {course} has finished processing.\n\n'
                        f"Students can now watch it and ask questions:\n{link}\n",
            }).encode(),
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        )
        urllib.request.urlopen(request, timeout=20)
        print(f"told {email} the lecture is ready")
    except Exception:
        traceback.print_exc()
        print("could not send the ready email; the lecture itself is fine")


def work(lecture_id: str, raw_key: str | None) -> None:
    global current_lecture
    print(f"lecture {lecture_id}")
    current_lecture = lecture_id
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
        db.update_lecture(lecture_id, status="failed", error=failure_message(e), locked_at=None)
        return
    finally:
        current_lecture = None

    print("✓ ready")
    notify_ready(lecture_id)
    # The streamable copy is in R2 now, so the raw upload isn't needed anywhere. The lecture is already
    # ready, so a cleanup problem must not stop the worker; raw_key stays set and names what is left behind.
    try:
        r2.delete(raw_key)
        src.unlink(missing_ok=True)
        db.update_lecture(lecture_id, raw_key=None, locked_at=None)
    except Exception:
        traceback.print_exc()
        print(f"could not remove the raw upload {raw_key}; it is still in storage")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--once", action="store_true", help="process what is queued, then exit (for the cloud worker)")
    once = parser.parse_args().once
    worker_id = socket.gethostname()
    threading.Thread(target=beat_forever, args=[worker_id], daemon=True).start()
    print(f"worker {worker_id}: waiting for lectures (Ctrl+C to stop)")
    conn = db.conn()
    try:
        while True:
            if requeued := requeue_stale(conn):
                print(f"requeued {requeued} lecture(s) whose worker went away")
            if expired := expire_abandoned_uploads(conn):
                print(f"removed {expired} upload(s) that were never finished")
            claimed = claim(conn)
            if claimed:
                work(*claimed)
            elif once:
                print("queue is empty")
                return
            else:
                time.sleep(POLL_SECONDS)
    except KeyboardInterrupt:
        print("\nstopped")


if __name__ == "__main__":
    main()
