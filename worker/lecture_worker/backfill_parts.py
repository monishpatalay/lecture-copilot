"""Embed sub-chunks for lectures that were processed before search used them.

    uv run python -m lecture_worker.backfill_parts

Reads each lecture's transcript.json from R2, cuts every segment's lines with split_parts and fills
segment_parts. Lectures that already have parts are skipped, so it is safe to run again.
"""
import json
import tempfile
from pathlib import Path

from lecture_worker import db, r2
from lecture_worker.stages.chunk import split_parts
from lecture_worker.stages.embed import embed_texts


def main() -> None:
    lectures = db.conn().execute(
        """select l.id, l.number, l.title from lectures l
           where l.status = 'ready' and not exists (select 1 from segment_parts p where p.lecture_id = l.id)
           order by l.created_at"""
    ).fetchall()
    for lecture_id, number, title in lectures:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "transcript.json"
            r2.download(f"lectures/{lecture_id}/transcript.json", path)
            lines = json.loads(path.read_text())
        segments = db.conn().execute(
            "select id, start_s, end_s from segments where lecture_id = %s order by start_s", [lecture_id]
        ).fetchall()
        # Segments are consecutive windows of these lines, so a line belongs to the segment its start falls in.
        parts = [
            (segment_id, text)
            for segment_id, start, end in segments
            for text in split_parts([line for line in lines if start <= line["start"] < end])
        ]
        vectors = embed_texts([text for _, text in parts])
        with db.conn().transaction():
            db.conn().cursor().executemany(
                "insert into segment_parts (segment_id, lecture_id, embedding) values (%s, %s, %s::extensions.vector)",
                [(segment_id, lecture_id, str(v)) for (segment_id, _), v in zip(parts, vectors)],
            )
        print(f"L{number} {title}: {len(parts)} parts for {len(segments)} segments", flush=True)


if __name__ == "__main__":
    main()
