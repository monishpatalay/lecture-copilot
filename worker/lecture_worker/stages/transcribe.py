import json
import os
import subprocess
from pathlib import Path

from lecture_worker import r2
from lecture_worker.job import Job, Paused

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


def transcribe_pieces(names: list[str], load, save, transcribe) -> list[list[dict]]:
    """Transcribes each piece that has no saved transcript yet, saving every one as soon as it is done.

    load(name) returns a saved transcript or None; save(name, segments) stores one; transcribe(name) does the
    work and may raise. Whatever was saved before the raise is not redone on the next call.
    """
    done = []
    for name in names:
        segments = load(name)
        if segments is None:
            segments = transcribe(name)
            save(name, segments)
        done.append(segments)
    return done


def transcribe_with_groq(audio: Path, workdir: Path, key) -> list[dict]:
    """Hosted Whisper, for machines without Apple Silicon. Splits the audio to fit the upload limit.

    Each piece's transcript is saved to R2 (`key` names the lecture's objects). The free tier transcribes two
    hours of audio an hour and the cloud worker's disk is gone after each run, so without this a lecture
    longer than two hours could never finish: every retry would start again from the first minute.
    """
    from openai import OpenAI, RateLimitError

    pieces_dir = workdir / "audio_pieces"
    pieces_dir.mkdir(exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(audio), "-f", "segment", "-segment_time", str(PIECE_SECONDS),
         "-c", "copy", str(pieces_dir / "%03d.mp3")],
        check=True,
    )
    # max_retries: the free tier allows 20 requests a minute and 2 hours of audio an hour; the SDK waits and retries.
    client = OpenAI(api_key=os.environ["GROQ_API_KEY"], base_url="https://api.groq.com/openai/v1", max_retries=6)
    files = sorted(pieces_dir.glob("*.mp3"))
    saved = 0

    def transcribe(name: str) -> list[dict]:
        try:
            with (pieces_dir / name).open("rb") as f:
                reply = client.audio.transcriptions.create(
                    file=f, model=GROQ_MODEL, response_format="verbose_json", timestamp_granularities=["segment"]
                )
        except RateLimitError as error:
            print(f"  transcription rate limit after {saved} of {len(files)} pieces: {error}")
            raise Paused(
                f"Transcription is paused: this hour's free allowance is used up ({saved} of {len(files)} parts are "
                "done and saved). Press Retry in about an hour and it will carry on from there."
            ) from error
        return [{"start": s["start"], "end": s["end"], "text": s["text"]} for s in
                (s if isinstance(s, dict) else s.model_dump() for s in (reply.segments or []))]

    def load(name: str):
        nonlocal saved
        segments = r2.read_json(key(f"pieces/{name}.json"))
        saved += segments is not None
        return segments

    def save(name: str, segments: list[dict]) -> None:
        nonlocal saved
        r2.write_json(key(f"pieces/{name}.json"), segments)
        saved += 1

    transcripts = transcribe_pieces([f.name for f in files], load, save, transcribe)
    pieces, offset = [], 0.0
    for piece, segments in zip(files, transcripts):
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
        segments = transcribe_with_groq(audio, job.dir, job.key)
    else:
        segments = transcribe_locally(audio)

    out = job.dir / "transcript.json"
    out.write_text(json.dumps(segments, ensure_ascii=False))
    r2.upload(out, job.key("transcript.json"))
