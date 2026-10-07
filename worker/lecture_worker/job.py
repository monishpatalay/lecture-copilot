from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Job:
    lecture_id: str
    src: Path  # original video on local disk
    dir: Path  # worker/data/<lecture_id>/

    def key(self, name: str) -> str:
        """R2 object key for a file of this lecture."""
        return f"lectures/{self.lecture_id}/{name}"


class InvalidVideo(Exception):
    """A problem with the uploaded file that the instructor can fix. Its message is shown to them as-is."""


class Paused(InvalidVideo):
    """Nothing is wrong with the video: a limit was hit and Retry will carry on from where this stopped."""
