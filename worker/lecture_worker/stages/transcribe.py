import json

import mlx_whisper

from lecture_worker import r2
from lecture_worker.job import Job

MODEL = "mlx-community/whisper-large-v3-turbo"


def run(job: Job) -> None:
    result = mlx_whisper.transcribe(str(job.dir / "audio.mp3"), path_or_hf_repo=MODEL, verbose=None)
    segments = [
        {"start": round(s["start"], 2), "end": round(s["end"], 2), "text": s["text"].strip()}
        for s in result["segments"]
        if s["text"].strip()
    ]
    out = job.dir / "transcript.json"
    out.write_text(json.dumps(segments, ensure_ascii=False))
    r2.upload(out, job.key("transcript.json"))
