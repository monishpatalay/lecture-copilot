import mimetypes
import os
from functools import cache
from pathlib import Path

import boto3

import lecture_worker.env  # noqa: F401


@cache
def _client():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def upload(path: Path, key: str) -> None:
    content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    _client().upload_file(str(path), os.environ["R2_BUCKET"], key, ExtraArgs={"ContentType": content_type})


def download(key: str, path: Path) -> None:
    _client().download_file(os.environ["R2_BUCKET"], key, str(path))


def delete(key: str) -> None:
    _client().delete_object(Bucket=os.environ["R2_BUCKET"], Key=key)
