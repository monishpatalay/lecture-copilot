"""Worker embeddings must match the Edge Function's (query side). Needs `supabase functions serve embed`."""
import json
import os
import urllib.request

import lecture_worker.env  # noqa: F401
from lecture_worker.stages.embed import embed_texts

SENTENCE = "A hash table resolves collisions by chaining entries in a linked list."


def edge_embed(text: str) -> list[float]:
    req = urllib.request.Request(
        f"{os.environ['NEXT_PUBLIC_SUPABASE_URL']}/functions/v1/embed",
        data=json.dumps({"input": text}).encode(),
        headers={
            "Authorization": f"Bearer {os.environ['NEXT_PUBLIC_SUPABASE_ANON_KEY']}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)["embedding"]


def test_worker_and_edge_embeddings_match():
    local = embed_texts([SENTENCE])[0]
    edge = edge_embed(SENTENCE)
    assert len(local) == len(edge) == 384
    cosine = sum(a * b for a, b in zip(local, edge))  # both L2-normalized
    print(f"cosine={cosine:.6f}")
    assert cosine > 0.99
