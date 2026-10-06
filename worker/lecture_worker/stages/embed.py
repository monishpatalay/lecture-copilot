import json
import os
import urllib.request
from functools import cache

from lecture_worker import db
from lecture_worker.job import Job

# Same weights as the Edge Function's built-in gte-small (Supabase/gte-small is its ONNX export).
MODEL_ID = "thenlper/gte-small"
EDGE_INPUT_CHARS = 2000  # the Edge Function's limit; gte-small only reads about that much anyway


@cache
def _model():
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(MODEL_ID)


def _edge_embed(text: str) -> list[float]:
    request = urllib.request.Request(
        f"{os.environ['NEXT_PUBLIC_SUPABASE_URL']}/functions/v1/embed",
        data=json.dumps({"input": text[:EDGE_INPUT_CHARS]}).encode(),
        headers={
            "Authorization": f"Bearer {os.environ['NEXT_PUBLIC_SUPABASE_ANON_KEY']}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)["embedding"]


def embed_texts(texts: list[str]) -> list[list[float]]:
    """384-d, mean-pooled, L2-normalized.

    Uses the local model when it is installed. Otherwise (the cloud worker, which skips the heavy
    PyTorch install) it asks the Edge Function, whose output matches: see tests/test_parity.py.
    """
    try:
        model = _model()
    except ImportError:
        return [_edge_embed(text) for text in texts]
    return model.encode(texts, normalize_embeddings=True).tolist()


def run(job: Job) -> None:
    chunks = json.loads((job.dir / "chunks.json").read_text())
    # Slide text is embedded too, so a question about a formula on the slide can match.
    vectors = embed_texts([f"{c['transcript']}\n{c['slide_text']}".strip() for c in chunks])

    # Each segment's ~20 s sub-chunks are embedded as well; search matches on them (see split_parts).
    # A chunks.json written before sub-chunks existed has none, and the segment is then found by its own vector.
    parts = [(i, text) for i, c in enumerate(chunks) for text in c.get("parts", [])]
    part_vectors = embed_texts([text for _, text in parts])

    with db.conn().transaction():
        cur = db.conn().cursor()
        cur.execute("delete from segments where lecture_id = %s", [job.lecture_id])  # their parts go with them
        segment_ids = []
        for c, v in zip(chunks, vectors):
            cur.execute(
                """insert into segments (lecture_id, start_s, end_s, transcript, slide_text, embedding)
                   values (%s, %s, %s, %s, %s, %s::extensions.vector) returning id""",
                (job.lecture_id, c["start_s"], c["end_s"], c["transcript"], c["slide_text"], str(v)),
            )
            segment_ids.append(cur.fetchone()[0])
        cur.executemany(
            "insert into segment_parts (segment_id, lecture_id, embedding) values (%s, %s, %s::extensions.vector)",
            [(segment_ids[i], job.lecture_id, str(v)) for (i, _), v in zip(parts, part_vectors)],
        )
