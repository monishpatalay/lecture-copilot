import json
from functools import cache

from sentence_transformers import SentenceTransformer

from lecture_worker import db
from lecture_worker.job import Job

# Same weights as the Edge Function's built-in gte-small (Supabase/gte-small is its ONNX export).
MODEL_ID = "thenlper/gte-small"


@cache
def _model() -> SentenceTransformer:
    return SentenceTransformer(MODEL_ID)


def embed_texts(texts: list[str]) -> list[list[float]]:
    """384-d, mean-pooled, L2-normalized — matches the Edge Function."""
    return _model().encode(texts, normalize_embeddings=True).tolist()


def run(job: Job) -> None:
    chunks = json.loads((job.dir / "chunks.json").read_text())
    # Slide text is embedded too, so a question about a formula on the slide can match.
    vectors = embed_texts([f"{c['transcript']}\n{c['slide_text']}".strip() for c in chunks])

    with db.conn().transaction():
        db.conn().execute("delete from segments where lecture_id = %s", [job.lecture_id])
        db.conn().cursor().executemany(
            """insert into segments (lecture_id, start_s, end_s, transcript, slide_text, embedding)
               values (%s, %s, %s, %s, %s, %s::extensions.vector)""",
            [(job.lecture_id, c["start_s"], c["end_s"], c["transcript"], c["slide_text"], str(v))
             for c, v in zip(chunks, vectors)],
        )
