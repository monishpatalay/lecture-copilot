import json
import re
import subprocess

import imagehash
from PIL import Image

from lecture_worker import r2
from lecture_worker.job import Job

SCENE_THRESHOLD = 0.3
# Hamming distance between 64-bit perceptual hashes; at or below this, two frames are the same slide.
DUPLICATE_DISTANCE = 6


def parse_showinfo(stderr: str) -> list[float]:
    """Timestamps (seconds) of the frames ffmpeg's showinfo filter logged, in order."""
    return [float(t) for t in re.findall(r"Parsed_showinfo.*?pts_time:\s*([\d.]+)", stderr)]


def drop_near_duplicates(hashes: list) -> list[int]:
    """Indexes to keep: each frame is compared with the last kept one, so a slide shown again later still counts."""
    kept: list[int] = []
    for i, h in enumerate(hashes):
        if not kept or h - hashes[kept[-1]] > DUPLICATE_DISTANCE:
            kept.append(i)
    return kept


def run(job: Job) -> None:
    frames_dir = job.dir / "slides"
    frames_dir.mkdir(exist_ok=True)
    for old in frames_dir.glob("*.jpg"):
        old.unlink()

    # eq(n,0) always keeps the first frame (t=0); the rest are scene changes.
    proc = subprocess.run(
        ["ffmpeg", "-y", "-hide_banner", "-i", str(job.src),
         "-vf", f"select='eq(n,0)+gt(scene,{SCENE_THRESHOLD})',showinfo,scale=-2:720",
         "-fps_mode", "vfr", "-q:v", "4", str(frames_dir / "%04d.jpg")],
        capture_output=True, text=True, check=True,
    )
    times = parse_showinfo(proc.stderr)
    files = sorted(frames_dir.glob("*.jpg"))
    if len(times) != len(files):
        raise RuntimeError(f"ffmpeg wrote {len(files)} frames but logged {len(times)} timestamps")

    keep = drop_near_duplicates([imagehash.phash(Image.open(f)) for f in files])
    slides = []
    for i in keep:
        key = job.key(f"slides/{files[i].name}")
        r2.upload(files[i], key)
        slides.append({"t_s": round(times[i], 2), "file": files[i].name, "image_key": key})
    for i in set(range(len(files))) - set(keep):
        files[i].unlink()

    (job.dir / "slides.json").write_text(json.dumps(slides))
