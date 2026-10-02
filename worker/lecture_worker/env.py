from pathlib import Path

from dotenv import load_dotenv

# Single .env at the repo root, shared with the web app.
load_dotenv(Path(__file__).resolve().parents[2] / ".env")
