import json
import os
import subprocess
from pathlib import Path

from lecture_worker import r2
from lecture_worker.job import Job

MLX_MODEL = "mlx-community/whisper-large-v3-turbo"
GROQ_MODEL = "whisper-large-v3-turbo"
# Groq's free tier takes files up to 25 MB. Ten minutes of our 48 kbit/s audio is under 4 MB.
PIECE_SECONDS = 600


def merge_pieces(pieces: list[tuple[float, list[dict]]]) -> list[dict]:
    """Joins the transcripts of consecutive audio pieces into one, shifting each by where its piece starts.

    pieces: [(offset_seconds, [{start, end, text}, ...]), ...] in order.
    """
    return [
        {"start": round(offset + s["start"], 2), "end": round(offset + s["end"], 2), "text": s["text"].strip()}
        for offset, segments in pieces
        for s in segments
        if s["text"].strip()
    ]


def _duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(out.stdout)


def transcribe_with_groq(audio: Path, workdir: Path) -> list[dict]:
    """Hosted Whisper, for machines without Apple Silicon. Splits the audio to fit the upload limit."""
    from openai import OpenAI

    pieces_dir = workdir / "audio_pieces"
    pieces_dir.mkdir(exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(audio), "-f", "segment", "-segment_time", str(PIECE_SECONDS),
         "-c", "copy", str(pieces_dir / "%03d.mp3")],
        check=True,
    )
    # max_retries: the free tier allows 20 requests a minute and 2 hours of audio an hour; the SDK waits and retries.
    client = OpenAI(api_key=os.environ["GROQ_API_KEY"], base_url="https://api.groq.com/openai/v1", max_retries=6)
    pieces, offset = [], 0.0
    for piece in sorted(pieces_dir.glob("*.mp3")):
        with piece.open("rb") as f:
            reply = client.audio.transcriptions.create(
                file=f, model=GROQ_MODEL, response_format="verbose_json", timestamp_granularities=["segment"]
            )
        segments = [s if isinstance(s, dict) else s.model_dump() for s in (reply.segments or [])]
        pieces.append((offset, segments))
        offset += _duration(piece)  # the real length: mp3 can't be cut at exactly 600 s
    return merge_pieces(pieces)


def transcribe_locally(audio: Path) -> list[dict]:
    import mlx_whisper

    # verbose=False prints a progress bar and nothing else; this stage runs for minutes and otherwise looks frozen.
    result = mlx_whisper.transcribe(str(audio), path_or_hf_repo=MLX_MODEL, verbose=False)
    return merge_pieces([(0.0, result["segments"])])


def run(job: Job) -> None:
    audio = job.dir / "audio.mp3"
    try:
        import mlx_whisper  # noqa: F401  (Apple Silicon only)
    except ImportError:
        segments = transcribe_with_groq(audio, job.dir)
    else:
        segments = transcribe_locally(audio)

    out = job.dir / "transcript.json"
    out.write_text(json.dumps(segments, ensure_ascii=False))
    r2.upload(out, job.key("transcript.json"))
