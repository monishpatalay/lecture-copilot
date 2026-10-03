# Lecture Copilot — project memory

Portfolio project. Instructor uploads lecture video → students ask questions → answers cite `[L# · mm:ss]` (or `h:mm:ss` past 1 h); citation chips seek the `<video>`.

## Hard rules
- $0/month: free tiers only. Ask before adding any paid service.
- Simplicity: no single-impl abstractions, no config for constants, no extra services. Postgres is the queue (no Redis). Worker talks only to Postgres + R2.
- Build only the approved phase. Ask before new deps, new services, or data-model changes.
- One small test per non-trivial function (timestamps, chunking, citations, RRF, embedding parity).
- Never commit secrets (`.env*` ignored; `.env.example` documents vars).
- Check official docs for library APIs / model ids; don't guess. Next.js is v16: read `web/node_modules/next/dist/docs/` before writing Next code.
- Small steps, commit after each working step.

## Stack
Next.js 16 App Router + TS + Tailwind v4 (web/) · Supabase Postgres + pgvector + Auth + Edge Function `embed` (built-in gte-small) · Cloudflare R2 (public r2.dev URL for video) · Python 3.12 worker via uv (worker/) · ffmpeg · mlx-whisper (`mlx-community/whisper-large-v3-turbo`) · Gemini `gemini-3.8-flash` (OpenAI-compatible endpoint) for slide text and as answer fallback · Groq `openai/gpt-oss-120b` for answers · gte-small 384-d embeddings (`thenlper/gte-small` in the worker).

## Pipeline (worker, one file per stage in worker/lecture_worker/stages/)
validate (ffprobe: mp4/mov/webm, ≤2 GB, ≤3 h) → audio (16 kHz mono mp3) → transcribe (`transcript.json` = [{start,end,text}]) → slides (scene>0.3 + imagehash dedupe, frame at t=0) → slide_text (one Gemini call, JSON) → transcode (720p H.264, videotoolbox with libx264 fallback, AAC 64k, faststart) → chunk (60–90 s windows, break at sentence ends, attach on-screen slide text) → embed + insert segments.
Each stage writes `worker/data/<lecture_id>/` and R2 `lectures/<lecture_id>/`, then leaves `<stage>.done`; a rerun skips stages whose marker exists. Updates `lectures.stage/progress`; the CLI sets `ready` or `failed` + `error`.

## Ask flow (web/app/api/ask, web/lib/{answer,citations,llm}.ts)
embed question (Edge Function) → `match_segments` (vector + full-text, RRF k=60, top 6, whole course) → gate on top cosine **similarity** → Groq, or Gemini on 429/5xx/network error → `validateCitations` → one regeneration that tells the model what was wrong → else 502. `NOT_COVERED` → "Not covered in these lectures", no citations. Every question that reaches the answer step is logged to `questions`.
- Citation rules: at least one citation; each maps to a retrieved segment (same lecture, `floor(start_s) ≤ t ≤ end_s`); a bracket that looks like a citation but doesn't parse fails the answer.
- Chips seek the player when the citation is for the open lecture, otherwise link to `/lectures/<id>?t=<seconds>`.

## Decisions
- Phase 1 RLS: public courses readable by anyone; instructor (owner) writes. `course_members` deferred to Phase 3.
- Supabase local-first (Docker); push the same migrations to a hosted free project later. The init migration is still edited in place because nothing is deployed; once pushed, migrations are append-only.
- Worker uses `DATABASE_URL` (psycopg): bulk inserts now, SKIP LOCKED claim in Phase 2.
- `lectures` has `unique (course_id, number)`: rerunning the CLI for the same course + number resumes that lecture.
- Relevance threshold is on cosine similarity because RRF is rank-only. `MIN_SIMILARITY = 0.75` in `web/lib/answer.ts` is a placeholder (off-topic ≈ 0.69–0.76, on-topic ≈ 0.78–0.92 on a tiny sample); tune on the eval set in Phase 2.
- Full-text leg ORs the question's terms (`plainto_tsquery` with `&` → `|`, ranked by `ts_rank`): a segment rarely contains every word of a question.
- `match_segments` also returns `lecture_id` and `similarity` (additions to the brief).
- Groq dropped `llama-3.3-70b-versatile` (checked 2026-10-03). `openai/gpt-oss-120b` is used instead, with `reasoning_effort: "low"`. Groq free tier: 30 RPM, 1K req/day, 8K tokens/min, 200K tokens/day, so the Gemini fallback fires under load and eval runs must pace themselves.
- Phase 1 CLI reads the raw video from local disk, so there is no raw upload in R2 to delete; that arrives with uploads in Phase 2.
- Transcript highlighting loads `transcript.json` from R2 server-side.
- `user_hash` = HMAC-SHA256 of the client IP keyed with the service role key (no extra secret).
- `supabase/seed.sql` creates a public demo course, id `00000000-0000-0000-0000-000000000001`; `courses.instructor_id` nullable until auth.
- One `.env` at the repo root: the worker loads it via `lecture_worker/env.py`, the web app via `web/next.config.ts`.

## UI tokens (web/app/globals.css)
`--color-sidebar #1E1F22` `--color-canvas #ECECEE` `--color-card #FFFFFF` `--color-ink #16181D` `--color-muted #6B7280` `--color-lime #D9F26B` (primary, citation chips, active) `--color-lavender #B8B0F5` (accents, question bubbles). Font Plus Jakarta Sans. Cards 24px radius (`rounded-card`), pill buttons, big bold numbers. Sidebar: Lectures, Ask, Exam prep, Insights; lime "Upload a lecture" card (instructors only, Phase 2).

## Commands
- DB: `supabase start` (also serves the `embed` function) · `supabase db reset` (re-applies migrations + seed, wipes data) · after a schema change: `supabase gen types typescript --local > web/lib/database.types.ts`
- Worker: `cd worker && uv run pytest` (needs `supabase start`) · `uv run python -m lecture_worker.process <video> --course-id <id> --number 4 --title "Hashing"`
- Web: `cd web && pnpm dev` · `pnpm test` · `pnpm lint` · `pnpm exec tsc --noEmit` · `pnpm build`

## Phases
1 pipeline + basic Ask (built; waiting on the real-lecture check) · 2 uploads + queue + evals · 3 auth/roles/demo/CI · 4 launch.
