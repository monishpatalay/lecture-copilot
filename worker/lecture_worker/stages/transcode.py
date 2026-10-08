import json
import subprocess
import threading

from lecture_worker import db, r2
from lecture_worker.job import Job

COMMON_OUT = ["-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart"]
SCALE = ["-vf", "scale=-2:'min(720,ih)'"]  # never upscale
# VideoToolbox has no CRF; -q:v is its constant-quality knob (higher = better, ~CRF 28 visually for slides).
HARDWARE = ["-c:v", "h264_videotoolbox", "-q:v", "45"]
# veryfast, measured against the faster presets on a 1080p sample: superfast saves 22% of the time for a file
# 65% larger, ultrafast 43% for one 3.7 times larger. Storage is the scarcer thing here, so veryfast stays.
SOFTWARE = ["-c:v", "libx264", "-crf", "28", "-preset", "veryfast", "-pix_fmt", "yuv420p"]

# This stage takes a lecture from 60% to 85% (see STAGES in process.py) and is the longest one: twelve
# minutes for a 75-minute video on the cloud worker. Without updates in between, the bar looks stuck.
PROGRESS_FROM, PROGRESS_TO = 60, 85
REPORT_EVERY_SECONDS = 5

# An upload that browsers already play, at a size worth streaming, is copied instead of re-encoded: seconds
# instead of minutes. Above this bitrate a 720p file is a screen recorder's or camera's raw output, and
# re-encoding is what makes it small enough to stream.
MAX_COPY_HEIGHT = 720
MAX_COPY_BITS_PER_SECOND = 4_000_000


def can_copy(probe: dict) -> bool:
    """True when ffprobe's report describes a file every browser plays as it is: H.264 (8-bit 4:2:0,
    progressive, at most 720p) with AAC audio in an MP4/MOV container, at a streamable bitrate."""
    streams = probe.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
    container = probe.get("format", {})
    if not video or not audio or "mp4" not in container.get("format_name", ""):
        return False
    try:
        bitrate = int(container.get("bit_rate", ""))
    except ValueError:
        return False  # unknown bitrate: don't guess
    return (
        video.get("codec_name") == "h264"
        and video.get("pix_fmt") == "yuv420p"
        and video.get("field_order", "progressive") == "progressive"
        and 0 < int(video.get("height", 0)) <= MAX_COPY_HEIGHT
        and audio.get("codec_name") == "aac"
        and bitrate <= MAX_COPY_BITS_PER_SECOND
    )


def seconds_encoded(line: str) -> float | None:
    """ffmpeg -progress prints key=value lines; `out_time_us` is how much of the video is done, in microseconds."""
    key, _, value = line.strip().partition("=")
    if key != "out_time_us" or not value.lstrip("-").isdigit():
        return None  # other keys, and "N/A" before the first frame
    return max(0, int(value)) / 1_000_000


def progress_at(encoded_s: float, duration_s: float) -> int:
    share = min(1.0, encoded_s / duration_s) if duration_s > 0 else 0.0
    return PROGRESS_FROM + int((PROGRESS_TO - PROGRESS_FROM) * share)


class Conversion(threading.Thread):
    """Makes the streamable video and uploads it, on its own thread.

    Nothing else in the pipeline needs the result, so it runs while the lecture is transcribed and its slides
    are read (see run_stages). It never touches the database: connections aren't shared across threads, so
    the main thread reads `progress`, `key` and `error` and does the writing (see finish).
    """

    def __init__(self, job: Job, duration_s: float) -> None:
        super().__init__(daemon=True)
        self.job, self.duration_s = job, duration_s
        self.progress = PROGRESS_FROM
        self.key: str | None = None
        self.error: BaseException | None = None
        self._process: subprocess.Popen | None = None

    def run(self) -> None:
        try:
            self.key = self._convert()
        except BaseException as error:  # handed to the main thread, which fails the lecture
            self.error = error

    def stop(self) -> None:
        """Ends a running ffmpeg, for when the lecture fails or the worker is stopped mid-conversion."""
        process = self._process
        if process and process.poll() is None:
            process.terminate()

    def _ffmpeg(self, command: list[str]) -> None:
        """Runs ffmpeg, following its progress. Raises CalledProcessError like subprocess.run(check=True)."""
        self._process = subprocess.Popen(
            [*command[:-1], "-progress", "pipe:1", "-nostats", command[-1]], stdout=subprocess.PIPE, text=True
        )
        for line in self._process.stdout:
            encoded = seconds_encoded(line)
            if encoded is not None:
                self.progress = progress_at(encoded, self.duration_s)
        if self._process.wait() != 0:
            raise subprocess.CalledProcessError(self._process.returncode, command)

    def _convert(self) -> str:
        job, out = self.job, self.job.dir / "video.mp4"
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(job.src)],
            capture_output=True, text=True, check=True,
        )
        start = ["ffmpeg", "-y", "-v", "error", "-i", str(job.src)]
        copied = False
        if can_copy(json.loads(probe.stdout)):
            try:
                # faststart moves the index to the front, so playback and seeking start before the download ends.
                self._ffmpeg([*start, "-map", "0:v:0", "-map", "0:a:0", "-c", "copy", "-movflags", "+faststart", str(out)])
                copied = True
                print("  transcode: already web-ready, copied without re-encoding", flush=True)
            except subprocess.CalledProcessError:
                print("  transcode: copy failed, re-encoding instead", flush=True)
        if not copied:
            try:
                self._ffmpeg([*start, *SCALE, *HARDWARE, *COMMON_OUT, str(out)])
            except subprocess.CalledProcessError:
                print("  videotoolbox failed, falling back to libx264", flush=True)
                self._ffmpeg([*start, *SCALE, *SOFTWARE, *COMMON_OUT, str(out)])
        key = job.key("video.mp4")
        r2.upload(out, key)
        return key


def start(job: Job) -> Conversion:
    """Begins converting the video in the background. Call once the file has been validated."""
    (duration_s,) = db.conn().execute("select coalesce(duration_s, 0) from lectures where id = %s", [job.lecture_id]).fetchone()
    conversion = Conversion(job, duration_s)
    conversion.start()
    return conversion


def finish(conversion: Conversion, job: Job) -> None:
    """Waits for the conversion, keeping the lecture's progress moving, then records where the video is."""
    reported = PROGRESS_FROM
    while conversion.is_alive():
        conversion.join(timeout=REPORT_EVERY_SECONDS)
        if conversion.progress != reported:
            reported = conversion.progress
            db.update_lecture(job.lecture_id, progress=reported)
    if conversion.error:
        raise conversion.error
    db.update_lecture(job.lecture_id, video_key=conversion.key)
