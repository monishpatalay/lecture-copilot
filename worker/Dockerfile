# The queue worker as a container, run on AWS ECS Fargate (see worker/aws/setup.sh).
# The same contents as the Modal image: no mlx-whisper or sentence-transformers, so the worker uses Groq's
# Whisper and the embed Edge Function. Settings arrive as environment variables from the task definition.
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir imagehash pillow boto3 python-dotenv "psycopg[binary]" openai

WORKDIR /app
COPY lecture_worker lecture_worker

# Processes every queued lecture, then exits, so a task is billed only while there is work.
CMD ["python", "-m", "lecture_worker.worker", "--once"]
