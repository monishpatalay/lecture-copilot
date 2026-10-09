"""The Postgres job queue: claiming with SKIP LOCKED and recovering stale locks. Needs `supabase start`.

These tests commit a few lectures (two connections must see them) and remove them afterwards, so they
only run when the real queue is idle: no queued lectures and no live worker.
"""
import os

import psycopg
import pytest

import lecture_worker.env  # noqa: F401
from lecture_worker.worker import claim, expire_abandoned_uploads, is_own_upload, requeue_stale

COURSE = "eeeeeeee-0000-0000-0000-000000000001"
OLDEST, NEWER, ABANDONED, IN_PROGRESS, DEAD_UPLOAD, LIVE_UPLOAD = (
    f"ffffffff-0000-0000-0000-00000000000{n}" for n in (1, 2, 3, 4, 5, 6)
)


def connect() -> psycopg.Connection:
    return psycopg.connect(os.environ["DATABASE_URL"])


@pytest.fixture
def queue():
    with connect() as setup:
        busy = setup.execute(
            """select (select count(*) from lectures where status = 'queued')
                    + (select count(*) from worker_heartbeats where last_seen_at > now() - interval '60 seconds')"""
        ).fetchone()[0]
        if busy:
            pytest.skip("the real queue is in use: stop the worker and let queued lectures finish first")
        setup.execute("insert into courses (id, title) values (%s, 'queue test')", [COURSE])
        setup.cursor().executemany(
            "insert into lectures (id, course_id, number, title, status, locked_at, created_at) values (%s, %s, %s, 't', %s, %s, %s)",
            [
                (OLDEST, COURSE, 1, "queued", None, "2020-01-01"),
                (NEWER, COURSE, 2, "queued", None, "2020-01-02"),
                (ABANDONED, COURSE, 3, "processing", "2020-01-01", "2020-01-03"),
                (IN_PROGRESS, COURSE, 4, "processing", "now", "2020-01-04"),
                (DEAD_UPLOAD, COURSE, 5, "uploading", "2020-01-01", "2020-01-05"),
                (LIVE_UPLOAD, COURSE, 6, "uploading", "now", "2020-01-06"),  # an old lecture being re-uploaded now
            ],
        )
    yield
    with connect() as cleanup:
        cleanup.execute("delete from courses where id = %s", [COURSE])


def test_two_workers_claim_different_lectures_oldest_first(queue):
    with connect() as first, connect() as second:
        assert claim(first)[0] == OLDEST  # its row lock is held until `first` commits
        assert claim(second)[0] == NEWER  # skips the locked row instead of waiting or double-claiming
        assert claim(second) is None
        first.rollback(), second.rollback()


def test_only_lectures_locked_for_too_long_go_back_to_the_queue(queue):
    with connect() as conn:
        assert requeue_stale(conn) == 1
        rows = dict(conn.execute("select id::text, status from lectures where course_id = %s", [COURSE]).fetchall())
        assert rows[ABANDONED] == "queued" and rows[IN_PROGRESS] == "processing"
        conn.rollback()


def test_only_uploads_abandoned_for_a_day_are_removed(queue):
    with connect() as conn:
        assert expire_abandoned_uploads(conn) == 1
        left = {row[0] for row in conn.execute("select id::text from lectures where course_id = %s", [COURSE])}
        assert DEAD_UPLOAD not in left and LIVE_UPLOAD in left
        conn.rollback()


def test_the_worker_only_touches_uploads_inside_the_lectures_own_folder():
    mine, theirs = "11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"
    assert is_own_upload(mine, f"lectures/{mine}/raw-0a1b2c3d.mp4")
    assert not is_own_upload(mine, f"lectures/{theirs}/video.mp4")
    assert not is_own_upload(mine, f"lectures/{mine}/raw-/../../{theirs}/video.mp4")
    assert not is_own_upload(mine, f"lectures/{mine}/video.mp4")
