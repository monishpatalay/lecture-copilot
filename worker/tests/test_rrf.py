"""match_segments: vector + full-text search fused with reciprocal rank fusion. Needs `supabase start`."""
import os

import psycopg
import pytest

import lecture_worker.env  # noqa: F401

COURSE, OTHER_COURSE = "aaaaaaaa-0000-0000-0000-000000000001", "aaaaaaaa-0000-0000-0000-000000000002"
L4, L5, OTHER_LECTURE = (f"bbbbbbbb-0000-0000-0000-00000000000{n}" for n in (4, 5, 9))
QUERY = [1.0, 0.0]


def vec(x: float, y: float) -> str:
    """A 384-d unit vector whose cosine similarity with QUERY is x."""
    return str([x, y, *[0.0] * 382])


@pytest.fixture
def db():
    """Seeds two courses inside a transaction that is rolled back afterwards."""
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        conn.execute("insert into courses (id, title) values (%s, 'c'), (%s, 'other')", [COURSE, OTHER_COURSE])
        conn.execute(
            "insert into lectures (id, course_id, number, title) values (%s, %s, 4, 'l4'), (%s, %s, 5, 'l5'), (%s, %s, 1, 'x')",
            [L4, COURSE, L5, COURSE, OTHER_LECTURE, OTHER_COURSE],
        )
        segments = [
            # (lecture, start, transcript, embedding)
            (L4, 0, "binary search trees keep keys sorted", vec(1.0, 0.0)),            # A: best vector hit, no keywords
            (L4, 70, "the load factor of a hash table with chaining", vec(0.9, 0.4359)),  # B: 2nd vector, best keywords
            (L4, 140, "load factor", vec(0.5, 0.866)),                                 # C: 3rd vector, some keywords
            (L5, 0, "heaps and priority queues", vec(-1.0, 0.0)),
            (OTHER_LECTURE, 0, "load factor chaining", vec(1.0, 0.0)),
        ]
        conn.cursor().executemany(
            "insert into segments (lecture_id, start_s, end_s, transcript, embedding) values (%s, %s, %s + 60, %s, %s::extensions.vector)",
            [(lec, start, start, text, emb) for lec, start, text, emb in segments],
        )
        yield conn
        conn.rollback()


def search(conn, course=COURSE, lecture=None):
    cur = conn.execute(
        "select * from match_segments(%s::extensions.vector, %s, %s, %s)",
        [vec(*QUERY), "what is the load factor in chaining", course, lecture],
    )
    cols = [c.name for c in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def test_segments_found_by_both_searches_outrank_the_top_vector_hit(db):
    rows = search(db, lecture=L4)
    # Vector ranks: A, B, C. Keyword ranks: B, C (C matches only some of the question's words; A matches none).
    assert [r["start_s"] for r in rows] == [70, 140, 0]
    assert [r["score"] for r in rows] == pytest.approx([1 / 62 + 1 / 61, 1 / 63 + 1 / 62, 1 / 61])
    assert [r["similarity"] for r in rows] == pytest.approx([0.9, 0.5, 1.0], abs=1e-3)


def test_a_segment_whose_sub_chunk_matches_the_question_moves_up(db):
    # C is third by its own vector, but one 20 s piece of it is exactly what the question asks about.
    (c_id,) = db.execute("select id from segments where lecture_id = %s and start_s = 140", [L4]).fetchone()
    db.execute(
        "insert into segment_parts (segment_id, lecture_id, embedding) values (%s, %s, %s::extensions.vector)",
        [c_id, L4, vec(1.0, 0.0)],
    )
    rows = search(db, lecture=L4)
    assert [r["start_s"] for r in rows] == [140, 70, 0]
    assert rows[0]["score"] == pytest.approx(1 / 63 + 1 / 61 + 1 / 62)  # 3rd by vector, 1st by sub-chunk, 2nd by keywords


def test_search_is_scoped_to_the_course_and_optionally_one_lecture(db):
    whole_course = search(db)
    assert {r["lecture_number"] for r in whole_course} == {4, 5}  # nothing from the other course
    assert len(whole_course) == 4

    one_lecture = search(db, lecture=L5)
    assert [(str(r["lecture_id"]), r["lecture_number"]) for r in one_lecture] == [(L5, 5)]
