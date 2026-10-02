# Lecture Copilot — project memory

Portfolio project. Instructor uploads lecture video → students ask questions → answers cite `[L# · mm:ss]` (or `h:mm:ss` past 1 h); citation chips seek the `<video>`.

## Hard rules
- $0/month: free tiers only. Ask before adding any paid service.
- Simplicity: no single-impl abstractions, no config for constants, no extra services. Postgres is the queue (no Redis). Worker talks only to Postgres + R2.
- Build only the approved phase. Ask before new deps, new services, or data-model changes.
- One small test per non-trivial function (timestamps, chunking, citations, RRF, embedding parity).
- Never commit secrets (`.env*` ignored; `.env.example` documents vars).
- Check official docs for library APIs / model ids; don't guess.
- Small steps, commit after each working step.

## Stack
Next.js App Router + TS + Tailwind (web/) · Supabase Postgres + pgvector + Auth + Edge Function `embed` (built-in gte-small) · Cloudflare R2 (public r2.dev URL for video) · Python 3.12 worker via uv (worker/) · ffmpeg · mlx-whisper (`mlx-community/whisper-large-v3-turbo`) · Gemini Flash (OpenAI-compatible endpoint) for slide text and as answer fallback · Groq `llama-3.3-70b-versatile` for answers · gte-small 384-d embeddings.

## Pipeline (worker, one file per stage in worker/lecture_worker/stages/)
validate (ffprobe: mp4/mov/webm, ≤2 GB, ≤3 h) → audio (16 kHz mono mp3) → transcribe (`transcript.json` = [{start,end,text}]) → slides (scene>0.3 + imagehash dedupe, frame at t=0) → slide_text (one Gemini call, JSON [{index,text}]) → transcode (720p H.264, videotoolbox if available, CRF~28, AAC 64k, faststart; delete raw from R2) → chunk (60–90 s windows, break at sentence ends, attach on-screen slide text) → embed + insert segments.
Each stage writes `worker/data/<lecture_id>/` and R2 `lectures/<lecture_id>/`; skipped if output exists. Updates `lectures.stage/progress`.

## Ask flow
embed question (Edge Function) → `match_segments` (vector + FTS, RRF k=60, top 6) → gate on top cosine **similarity** (not RRF score) → LLM → `validateCitations` (each citation must map to a retrieved segment: same lecture, time within [start,end]) → regenerate once → else error. `NOT_COVERED` → "Not covered in these lectures", no citations. Log every question (no names).

## Decisions
- Phase 1 RLS: public courses readable by anyone; instructor (owner) writes. `course_members` deferred to Phase 3.
- Supabase local-first (Docker); push same migrations to hosted free project later.
- Worker uses `DATABASE_URL` (psycopg) — needed for bulk inserts and Phase 2 SKIP LOCKED claim.
- Relevance threshold on cosine similarity (RRF is rank-only).
- Transcript highlighting loads `transcript.json` from R2 server-side.
- `supabase/seed.sql` creates a public demo course with a fixed UUID; `courses.instructor_id` nullable until auth.

## UI tokens
`--sidebar #1E1F22` `--canvas #ECECEE` `--card #FFFFFF` `--ink #16181D` `--muted #6B7280` `--lime #D9F26B` (primary, citation chips, active) `--lavender #B8B0F5` (accents, user bubbles). Font Plus Jakarta Sans. Cards ~24px radius, pill buttons, big bold numbers. Sidebar: Lectures, Ask, Exam prep, Insights; lime "Upload a lecture" card (instructors only).

## Commands
- DB: `supabase start` · `supabase db reset` (migrations + seed) · `supabase functions serve embed`
- Worker: `cd worker && uv run pytest` · `uv run python -m lecture_worker.process <video> --course-id <id> --number 4 --title "Hashing"`
- Web: `cd web && pnpm dev` · `pnpm vitest run`

## Phases
1 pipeline + basic Ask (current) · 2 uploads + queue + evals · 3 auth/roles/demo/CI · 4 launch.
