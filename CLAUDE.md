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
Next.js 16 App Router + TS + Tailwind v4 (web/) · Supabase Postgres + pgvector + Auth + Edge Function `embed` (built-in gte-small) · Cloudflare R2 (public r2.dev URL for video) · Python 3.12 worker via uv (worker/) · ffmpeg · mlx-whisper (`mlx-community/whisper-large-v3-turbo`) · Gemini via its OpenAI-compatible endpoint (`gemini-3.8-flash` for slide text, `gemini-3.5-flash-lite` as answer fallback) · Groq `openai/gpt-oss-120b` for answers · gte-small 384-d embeddings (`thenlper/gte-small` in the worker).

## Pipeline (worker, one file per stage in worker/lecture_worker/stages/)
validate (ffprobe: mp4/mov/webm, ≤2 GB, ≤3 h) → audio (16 kHz mono mp3) → transcribe (`transcript.json` = [{start,end,text}]) → slides (scene>0.3 + imagehash dedupe, frame at t=0) → slide_text (one Gemini call, JSON) → transcode (720p H.264, videotoolbox with libx264 fallback, AAC 64k, faststart) → chunk (60–90 s windows, break at sentence ends, attach on-screen slide text) → embed + insert segments.
Each stage writes `worker/data/<lecture_id>/` and R2 `lectures/<lecture_id>/`, then leaves `<stage>.done`; a rerun skips stages whose marker exists. Updates `lectures.stage/progress`; the CLI sets `ready` or `failed` + `error`.

## Ask flow (web/app/api/ask, web/lib/{answer,citations,llm}.ts)
embed question (Edge Function) → `match_segments` (vector + full-text, RRF k=60, top 6, whole course) → gate on top cosine **similarity** → Groq, or Gemini on 429/5xx/network error → `validateCitations` → one regeneration that tells the model what was wrong → else 502. `NOT_COVERED` → "Not covered in these lectures", no citations. Every question that reaches the answer step is logged to `questions`.
- Citation rules: at least one citation; each maps to a retrieved segment (same lecture, `floor(start_s) ≤ t ≤ end_s`); any single punctuation mark is accepted between `L#` and the time, `[ ]`, `【 】` or `［ ］` as brackets, and spaces inside them (gpt-oss writes `【L4 · 16:09】` and `[ L3 · 15:44 ]`); a time on the boundary of two segments is credited to the one that starts there; a bracket that looks like a citation but doesn't parse fails the answer. Rejected answers are logged with the reason (`console.warn` in `generateAnswer`).
- Chips seek the player when the citation is for the open lecture, otherwise link to `/lectures/<id>?t=<seconds>`.

## Decisions
- Phase 1 RLS: public courses readable by anyone; instructor (owner) writes. `course_members` deferred to Phase 3.
- Supabase local-first (Docker); push the same migrations to a hosted free project later. Migrations are append-only from Phase 2 on, because the local database now holds real lecture data: add a new file and run `supabase migration up` (never `db reset` without re-processing lectures).
- Worker uses `DATABASE_URL` (psycopg): bulk inserts now, SKIP LOCKED claim in Phase 2.
- `lectures` has `unique (course_id, number)`: rerunning the CLI for the same course + number resumes that lecture.
- Relevance threshold is on cosine similarity because RRF is rank-only. `MIN_SIMILARITY = 0.78` in `web/lib/answer.ts`, tuned on the eval set (weakest covered question 0.801).
- Full-text leg ORs the question's terms (`plainto_tsquery` with `&` → `|`, ranked by `ts_rank`): a segment rarely contains every word of a question.
- `match_segments` also returns `lecture_id` and `similarity` (additions to the brief).
- Groq dropped `llama-3.3-70b-versatile` (checked 2026-10-03). `openai/gpt-oss-120b` is used instead, with `reasoning_effort: "low"`. Groq free tier: 30 RPM, 1K req/day, 8K tokens/min, 200K tokens/day, so the Gemini fallback fires under load and eval runs must pace themselves.
- Phase 1 CLI reads the raw video from local disk (raw files live in `worker/data/raw/`, gitignored), so there is no raw upload in R2 to delete; that arrives with uploads in Phase 2.
- Answer fallback is `gemini-3.5-flash-lite`: on 2026-10-03 `gemini-3.8-flash` returned 503 "high demand" on the free tier and SDK retries stretched one fallback answer to 18 s, while the lite model answered the same prompt in about 1 s.
- Transcript highlighting loads `transcript.json` from R2 server-side.
- `user_hash` = HMAC-SHA256 of the client IP keyed with the service role key (no extra secret).
- `supabase/seed.sql` creates a public demo course, id `00000000-0000-0000-0000-000000000001`; `courses.instructor_id` nullable until auth.
- One `.env` at the repo root: the worker loads it via `lecture_worker/env.py`, the web app via `web/next.config.ts`.

## Phase 2: uploads, queue, evals
- Upload flow: `POST /api/lectures` (validates, reserves the lecture, returns a presigned R2 PUT URL signed for one content type) → browser PUTs the file → `POST /api/lectures/:id/complete` (checks the object exists and is ≤ 2 GB, sets `queued`) → `GET /api/lectures/:id` polled every 3 s → `POST /api/lectures/:id/retry` for failed lectures. Signing uses `aws4fetch` (web/lib/r2.ts).
- A lecture that is `uploading` or `failed` can be replaced by a new upload. Each attempt gets its own raw key (`raw-<8 hex>.<ext>`); when the worker doesn't have that file locally it wipes the lecture's folder and starts clean.
- Worker (`uv run python -m lecture_worker.worker`): SKIP LOCKED claim, lock renewed by the heartbeat thread every 15 s, locks older than 2 h requeued, uploads abandoned for 24 h removed (`locked_at` is the upload start for `uploading` rows), Ctrl+C requeues the lecture in hand, raw upload deleted from R2 after success.
- `worker_heartbeats` table (addition to the brief's data model): the web app shows "Queued · processor offline" after 60 s without a heartbeat.
- Failed lectures store a message meant for the instructor (`InvalidVideo` messages as-is, anything else a generic one); tracebacks stay in the worker output.
- **Open item:** the R2 bucket needs a CORS rule allowing PUT from the web origin. The API token can't set it (AccessDenied), so it has to be added in the Cloudflare dashboard. Until then browser uploads fail at the PUT; the same flow works with curl.
- Evals: `evals/questions.jsonl` has 150 questions (40 per lecture for 6.006 S20 lectures 3, 4, 5, plus 30 uncovered), written by Claude from the transcripts and not human-reviewed. `python3 evals/run_eval.py [--answers N]`, results in `evals/results.json`.
- Baseline (2026-10-04, 147 segments): recall@1 0.633, recall@3 0.867, recall@6 0.933, MRR 0.748. On the fixed 30-question subset: citation validity 1.0, answers citing the gold segment 0.90, not-covered accuracy 1.0, latency p50 0.77 s / p95 1.11 s, all on Groq.
- The Phase 2 code review was cut short by a session limit: only the queue-worker area was reviewed (4 findings, all fixed). Upload API, browser code and eval runner were not independently reviewed.

## Phase 3: sign-in, roles, demo limit, CI
- Sign-in: Supabase Auth magic link. `web/lib/supabase-server.ts` is the client for everything user-facing (acts as the viewer, RLS applies); `web/proxy.ts` refreshes the session (Next 16 calls middleware "proxy"); `/auth/confirm` trades the emailed token for a cookie; `/auth/signout` is a POST. Local emails land in Mailpit at http://127.0.0.1:54324. The email template is `supabase/templates/magic_link.html`; a hosted project needs the same template set in its dashboard.
- Roles: a profile (student) is created on first sign-in. `select make_instructor('email');` in SQL appoints an instructor and gives them any course without an owner. There is no self-service path.
- Uploads: `requireInstructor()` / `ownedLecture()` gate the write routes; instructors upload only to courses they own. This replaced the Phase 2 "refuse in production" guard.
- `course_members` + `is_course_member()` make private courses readable by members. Nothing adds members yet.
- Demo limit: visitors who aren't signed in get 20 questions per day per course, counted from `questions` by `user_hash` (HMAC of user id, or of IP when anonymous). The eval runner sends `x-eval-key: <service role key>` to bypass it.
- `/api/ask` returns `sources` (the cited segments with an excerpt) and the Ask panel lists them under each answer.
- Chapters: `lectures.chapters` jsonb, written by the `chapters` stage (one Gemini `gemini-3.5-flash-lite` call, reply validated by `clean_chapters`), shown as pills on the lecture page.
- CI (`.github/workflows/ci.yml`, never run yet: the repo has no GitHub remote): web typecheck/lint/tests, worker pure-logic tests, and the retrieval eval on a fixed 30-question subset over `evals/fixtures/lectures_and_segments.sql`, failing if recall@3 is more than 3 points under `evals/baseline.json` (0.85).

## Deployment (2026-10-05)
- Live site: https://lecture-copilot-red.vercel.app (Vercel project `lecture-copilot`, team `monishs-projects-7c000b07`, root directory `web`, deploys on every push to `main`). The `…-monishs-projects-…vercel.app` aliases sit behind Vercel login; only the `-red` domain is public.
- GitHub: https://github.com/monishpatalay/lecture-copilot (private). CI is green.
- Hosted Supabase: project `sraszspzndzqulcjyyge` (us-west-1). Schema pushed with `supabase db push --db-url`, demo course seeded, lectures and segments loaded from `evals/fixtures/lectures_and_segments.sql`, `embed` function deployed.
- Env files (all git-ignored): `.env` = local stack; `.env.production` = hosted Supabase URL, keys and `DATABASE_URL` (session pooler, password percent-encoded); `.env.vercel` = what was pasted into Vercel's environment variables.
- Not done yet: hosted auth settings (site URL, redirect URL, magic-link template), R2 CORS rule, and running the worker against the hosted database.

## Cloud worker (2026-10-06)
The owner wants processing not to depend on their Mac, and other professors able to upload. Uploading stays invite-only.
- `.github/workflows/process.yml` runs `python -m lecture_worker.worker --once` on GitHub Actions: on `workflow_dispatch` (the site calls it from `wakeProcessor()` in `web/lib/processor.ts` when a lecture is queued or retried, if `GITHUB_DISPATCH_TOKEN` is set in Vercel) and every 6 hours as a backup. Its first step exits early when nothing is queued. Repo secrets hold the hosted `DATABASE_URL`, Supabase URL + anon key, R2 and LLM keys.
- The worker picks its tools by what is installed, with no config: `mlx-whisper` present → local Whisper, else Groq `whisper-large-v3-turbo` (audio split into 10-minute pieces for the 25 MB free-tier limit; `merge_pieces` shifts timestamps); `sentence-transformers` present → local gte-small, else the `embed` Edge Function. The Mac worker still works, and both can run at once.
- Groq free tier for audio: 20 requests/min, 7,200 audio seconds/hour, 28,800/day. A 3-hour lecture exceeds the hourly allowance and would need a retry.
- Verified 2026-10-06: a 2-minute clip queued on the hosted database went to `ready` in about 70 s on GitHub Actions. Not yet verified: a full-length lecture there, and the site-triggered dispatch.
- Instructors create their own courses (`POST /api/courses`, form on `/upload`); new courses are public.
- The status text is now "Queued · waiting for a processor" (was "processor offline"), since no worker is running until the job starts.
- Live site address is https://lecture-copilot.monishpatalay.dev (custom domain). Sign-in emails go through Resend (`noreply@login.monishpatalay.dev`). `officialmonishh@gmail.com` is the instructor on the hosted project.

## Professor access requests (2026-10-05)
The owner doesn't want to run SQL to appoint professors.
- A signed-in student opens `/professor-access` (sidebar link) and sends name, where they teach and what they plan to upload. One request per account; a declined account cannot ask again.
- The admin sees pending requests on `/requests` (sidebar link with a count) and approves or declines. Approve sets `role = 'instructor'`. Anyone else gets a 404 there.
- Data model: `profiles.is_admin`, `request_status` (`pending` / `declined` / null), `request_affiliation`, `request_note`, `requested_at`. Admin is a flag, not a role, so the instructor checks are unchanged. Writes go through server actions (`web/app/professor-access/actions.ts`) with the service role; `profiles` stays select-own under RLS.
- Appoint an admin once, after they have signed in: `update profiles set is_admin = true where id = (select id from auth.users where email = '...');`. On the hosted project the admin is `officialmonishh@gmail.com`.
- No email is sent on a new request or a decision; the admin checks the badge.
- `web/lib/database.types.ts` was edited by hand for these columns (Docker was off); regenerate it next time the local stack is up, and run `supabase migration up` locally.

## First real lecture (2026-10-03)
MIT 6.006 Spring 2020 Lecture 4 "Hashing" (53 min, 640×360, 123 MB, CC BY-NC-SA) processed in 7 min 20 s on an M4 / 16 GB: audio 12 s, transcribe 4 min 54 s, slides 14 s, slide_text 17 s, transcode + upload 1 min 39 s, embed 4 s. Output: 1,944 transcript lines, 47 segments, 140 MB video (larger than the source at the same 360p).
- Blackboard lectures get no slide text: scene detection kept 2 frames, both without readable text.
- Before the parser accepted `【 】` brackets, one covered question was rejected 2 times out of 3.
- Independent review of 4 answers: all 12 citation markers were supported by their segments (11 fully, 1 partly); 3 passed with notes and 1 failed for using a retrieved segment without citing it. The system prompt now requires a citation at the end of every sentence, which fixed that answer. Reviewers also noted that the supporting words start 0–27 s after the seek, because citations point at segment starts.
- About 1.8K tokens per question, so Groq's 8K tokens/min allows roughly 4 questions a minute before the fallback takes over.

## UI tokens (web/app/globals.css)
`--color-sidebar #1E1F22` `--color-canvas #ECECEE` `--color-card #FFFFFF` `--color-ink #16181D` `--color-muted #6B7280` `--color-lime #D9F26B` (primary, citation chips, active) `--color-lavender #B8B0F5` (accents, question bubbles). Font Plus Jakarta Sans. Cards 24px radius (`rounded-card`), pill buttons, big bold numbers. Sidebar: Lectures, Ask, Exam prep, Insights; lime "Upload a lecture" card (instructors only, Phase 2).

## Commands
- DB: `supabase start` (also serves the `embed` function) · `supabase db reset` (re-applies migrations + seed, wipes data) · after a schema change: `supabase gen types typescript --local > web/lib/database.types.ts`
- Worker: `cd worker && uv run pytest` (needs `supabase start`) · `uv run python -m lecture_worker.process <video> --course-id <id> --number 4 --title "Hashing"` · `uv run python -m lecture_worker.worker` (queue loop) · `uv run pytest ../evals` (eval metric tests)
- Evals: `python3 evals/run_eval.py` (retrieval, about a minute) · `python3 evals/run_eval.py --answers 30` (also end to end; needs the web app running)
- Web: `cd web && pnpm dev` · `pnpm test` · `pnpm lint` · `pnpm exec tsc --noEmit` · `pnpm build`

## Phases
1 pipeline + basic Ask (done 2026-10-03; real-lecture check passed) · 2 uploads + queue + evals (built 2026-10-04; browser upload waits on the R2 CORS rule) · 3 auth/roles/demo/CI (built 2026-10-04; CI untested until the repo is on GitHub) · 4 launch (deployed 2026-10-05; README, hosted sign-in settings and CORS still open).
