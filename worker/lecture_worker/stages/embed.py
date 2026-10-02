from functools import cache

from sentence_transformers import SentenceTransformer

# Same weights as the Edge Function's built-in gte-small (Supabase/gte-small is its ONNX export).
MODEL_ID = "thenlper/gte-small"


@cache
def _model() -> SentenceTransformer:
    return SentenceTransformer(MODEL_ID)


def embed_texts(texts: list[str]) -> list[list[float]]:
    """384-d, mean-pooled, L2-normalized — matches the Edge Function."""
    return _model().encode(texts, normalize_embeddings=True).tolist()
