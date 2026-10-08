"""The cloud worker on Modal: the same queue worker, on a machine with enough cores to convert video quickly.

    cd worker && uvx modal deploy modal_app.py

GitHub Actions' free machine spends about two minutes installing tools on every run and converts a 75-minute
1080p lecture in twelve. Here the tools are baked into the image and the run gets 16 cores, billed by the
second, which Modal's monthly free credit covers at this project's volume.

The site wakes it by POSTing the shared token to `wake` (see web/lib/processor.ts). The GitHub workflow stays
as the six-hourly backup; both claim lectures with SKIP LOCKED, so they can't process the same one twice.
Settings come from the Modal secret `lecture-copilot` (created from the git-ignored .env.modal).
"""
import modal

app = modal.App("lecture-copilot")

# No mlx-whisper or sentence-transformers: without them the worker uses Groq's Whisper and the embed Edge
# Function, exactly as it does on GitHub Actions.
image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg")
    .pip_install("imagehash", "pillow", "boto3", "python-dotenv", "psycopg[binary]", "openai", "fastapi[standard]")
    .add_local_python_source("lecture_worker")
)
secrets = [modal.Secret.from_name("lecture-copilot")]


# max_containers: two uploads at once each get a machine; a burst can't start more than that.
@app.function(image=image, secrets=secrets, cpu=16, memory=8192, timeout=2 * 60 * 60, max_containers=2)
def process_queue() -> None:
    """Processes every queued lecture, then exits. The same entry point as `worker --once`."""
    import sys

    from lecture_worker import worker

    sys.argv = ["lecture_worker.worker", "--once"]
    worker.main()


@app.function(image=image, secrets=secrets)
@modal.fastapi_endpoint(method="POST")
def wake(body: dict) -> dict:
    """Starts a worker run and returns at once. Only a caller that knows PROCESSOR_TOKEN may."""
    import hmac
    import os

    from fastapi import HTTPException

    if not hmac.compare_digest(str(body.get("token", "")), os.environ["PROCESSOR_TOKEN"]):
        raise HTTPException(status_code=401, detail="wrong token")
    process_queue.spawn()
    return {"started": True}
