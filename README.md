# Lecture Copilot

Ask a question about a lecture video and get an answer where every sentence cites the moment it comes from, like `L4 · 31:32`. Clicking the citation moves the video to that second.

**Live demo:** https://lecture-copilot.monishpatalay.dev (three MIT 6.006 lectures, no sign-in needed to ask)

![A lecture page: the video, its transcript, and an answer whose citations point at exact moments](docs/lecture-page.jpeg)

In the screenshot the answer cites `L4 · 31:32`, and the transcript line at 31:32 is where the lecturer says it ("maybe make it a dynamic array or a linked list").

## What it does

| For students | For professors |
|---|---|
| **Ask** a lecture or a whole course. Answers stream in, cite their sources and say "Not covered in these lectures" when the lectures don't answer the question. | **Upload** a video in the browser (MP4, MOV or WebM, up to 2 GB and 3 hours). It is transcribed, chaptered and indexed without anyone's laptop being on. |
| **Follow up** ("why?", "explain that more simply") and the earlier exchange is taken into account. | **Insights**: what students ask, which questions the lectures didn't cover, and the most-cited moments. |
| **Exam prep**: multiple-choice questions written from each lecture, scored, each linking to the moment that explains the answer. | **Manage**: rename or delete courses and lectures. Uploading is invite-only: people request access and the admin approves. |

![Exam prep: a multiple-choice question with the correct answer highlighted and a link to the lecture moment](docs/exam-prep.jpeg)

## How it works

```mermaid
flowchart LR
  subgraph Upload
    B[Browser] -- "presigned PUT" --> R2[(Cloudflare R2)]
    B -- "queued" --> PG[(Postgres + pgvector)]
  end
  subgraph Worker["Worker (Python, GitHub Actions or a Mac)"]
    direction TB
    V[validate] --> A[audio] --> T[transcribe] --> S[slides] --> ST[slide text] --> X[transcode] --> C[chunk] --> CH[chapters] --> E[embed]
  end
  PG -- "claim (SKIP LOCKED)" --> Worker
  Worker -- "video, transcript, slides" --> R2
  Worker -- "segments + sub-chunks" --> PG
  subgraph Ask
    Q[Question] --> EM[embed] --> M["match_segments (3 ranked lists, RRF)"] --> G{relevant?}
    G -- no --> NC[Not covered]
    G -- yes --> LLM[Groq, Gemini fallback] --> VC[validate citations] --> RF[land on the sentence] --> ANS[Answer + chips]
    VC -- "invalid: one retry" --> LLM
  end
  PG --> M
```

**Processing a lecture.** The worker claims a queued lecture with `FOR UPDATE SKIP LOCKED` (Postgres is the job queue; there is no Redis) and runs one stage per file in `worker/lecture_worker/stages/`. Each stage leaves a marker, so a failed run resumes where it stopped. Speech is transcribed with Whisper large-v3-turbo (locally through MLX on Apple Silicon, or through Groq's hosted Whisper on the cloud worker). Slide frames are found by scene detection and read by Gemini. The transcript is cut into 60–90 second segments that end on a sentence, and each segment is also cut into ~20 second sub-chunks; both are embedded with `gte-small` (384 dimensions).

**Answering a question.**

1. The question is embedded by a Supabase Edge Function running the same `gte-small` weights the worker used (a parity test checks the two agree).
2. `match_segments`, one SQL function, ranks segments three ways (the segment's own vector, its best sub-chunk's vector, and full-text search) and merges the three lists with reciprocal rank fusion. The top six go to the model.
3. If the best cosine similarity is under 0.78, the answer is "Not covered in these lectures" and no model is called.
4. Groq (`openai/gpt-oss-120b`) writes the answer from those six segments only, ending every sentence with a citation. On a rate limit or outage the same prompt goes to Gemini.
5. **Citations are checked in code, not trusted.** Each must name a retrieved segment and a time inside it. An answer that fails is regenerated once with the reason; if it fails again the user gets an error, never an unverified citation.
6. Each citation is then moved from the start of its segment to the stretch of transcript that shares the most distinctive words with the sentence it supports, so the click lands on the sentence.

Follow-ups are first rewritten into a standalone question using the last three exchanges, then go through the same steps.

## Evaluation

`evals/questions.jsonl` has 150 questions over the three demo lectures: 120 with a gold passage (lecture and time span) and 30 the lectures do not cover. `python3 evals/run_eval.py` measures retrieval; `--answers 30` also asks a fixed 30-question subset end to end. CI runs the retrieval eval on every push and fails if recall@3 drops more than 3 points.

**Retrieval** (120 covered questions; a hit is a retrieved segment that overlaps the gold passage):

| | Two ranked lists (before) | With sub-chunks (now) |
|---|---|---|
| Right segment ranked first (recall@1) | 0.633 | **0.692** |
| In the top 3 (recall@3) | **0.858** | 0.833 |
| In the top 6, which is what the model reads (recall@6) | **0.942** | 0.933 |
| Mean reciprocal rank | 0.747 | **0.774** |

Adding sub-chunks moved 15 questions to first place and pushed 7 out of it. It did not widen coverage: the top six, which is what decides whether a question can be answered at all, is unchanged within one question. Reweighting the three lists, changing pool sizes, a different full-text ranking and prefixing lecture titles to the embedded text were all tried and none beat this beyond noise.

**End to end** (30 questions: 20 covered, 10 not; all answered by the primary model):

| | Result |
|---|---|
| Answers whose citations all passed the code check | 1.00 |
| Answered questions that cite the gold segment | 0.90 |
| Right call on covered vs not covered | 1.00 |
| Latency, full answer (p50 / p95) | 0.97 s / 1.31 s |

**Where citations land** (27 citations of gold segments in that run):

| | Segment start (before) | Sentence-level (now) |
|---|---|---|
| Lands inside the gold passage | 56% | **78%** |
| Mean distance from the gold passage | 11.3 s | **4.2 s** |

Ten citations moved closer to the passage and four moved further away.

**Read these numbers with care.** The questions and gold passages were written by an AI model from the transcripts and have not been reviewed by a person. There are three lectures, all blackboard lectures from one course, and 120 questions is a small sample: a difference of one or two questions is noise. The before/after choices were made on this same set, so the gains are likely a little optimistic.

## Design decisions

- **Citations are validated, then refined.** The model can't invent a timestamp: the check is a pure function with tests, and it accepts the bracket and spacing variants models actually produce.
- **A relevance gate before the model.** Rank fusion scores only reflect rank, so the gate uses cosine similarity. It was tuned so no covered eval question is blocked.
- **Postgres is the queue.** Claims use `SKIP LOCKED`, a heartbeat renews the lock, stale locks are requeued and abandoned uploads expire. The worker talks only to Postgres and R2, never to the web app.
- **Everything has a free-tier fallback.** Groq falls back to Gemini for answers; slide reading falls back to a lighter Gemini model; the cloud worker uses hosted Whisper and the Edge Function for embeddings so it needs no GPU.
- **Row-level security does the gating.** The web app reads as the signed-in viewer; the service role is used only for the few writes that have no public policy.

## Stack and cost

Next.js 16 (App Router, React 19, Tailwind v4) on Vercel · Supabase Postgres with pgvector, Auth (magic link) and an Edge Function · Cloudflare R2 for video · Python 3.12 worker run with `uv`, on GitHub Actions or a Mac · ffmpeg · Whisper large-v3-turbo · `gte-small` embeddings · Groq and Gemini through their OpenAI-compatible endpoints.

It runs on free tiers: **$0 a month**. The limits that matter are Groq's (about four questions a minute before the Gemini fallback takes over, and two hours of audio transcription per hour).

Processing time for a 52-minute lecture: 7 min 20 s on an M4 MacBook, and 19 minutes on the GitHub Actions worker in the one full-length run so far, 11 minutes of which was a stalled Gemini request (requests now time out after two minutes).

## Run it locally

Needs Docker, the Supabase CLI, Node 24 with pnpm, `uv` and ffmpeg. The full worker (local Whisper) needs Apple Silicon.

```bash
cp .env.example .env            # fill in the R2, Groq and Gemini keys; supabase start prints the rest
supabase start                  # Postgres, Auth, the embed function; applies migrations and the demo course
cd web && pnpm install && pnpm dev

# process a lecture from disk
cd worker && uv run python -m lecture_worker.process lecture.mp4 \
  --course-id 00000000-0000-0000-0000-000000000001 --number 1 --title "My lecture"
# or run the queue worker for browser uploads
uv run python -m lecture_worker.worker
```

To upload through the browser locally, sign in (the email lands in Mailpit at http://127.0.0.1:54324), then run `select make_instructor('you@example.com');` in SQL.

Tests: `cd web && pnpm test` · `cd worker && uv run pytest` (needs `supabase start`) · `python3 evals/run_eval.py`.

## Layout

```
web/                    Next.js app
  app/                  pages, API routes (ask, lectures, courses) and server actions
  lib/                  answer.ts, citations.ts, refine.ts, followup.ts, llm.ts, practice.ts, insights.ts (+ tests)
worker/lecture_worker/  queue worker, CLI and one file per pipeline stage
supabase/               migrations (schema, RLS, match_segments) and the embed Edge Function
evals/                  questions, runner, recorded results and the CI fixture
.github/workflows/      ci.yml (tests + retrieval eval) and process.yml (the cloud worker)
```

## Known limits

- Tested on three blackboard lectures from one course. Slide-heavy lectures run through the same pipeline but have not been evaluated.
- A lecture close to three hours exceeds Groq's free hourly transcription allowance and needs a retry.
- Citations that are refined by word overlap can miss when an answer paraphrases heavily; they then stay at the segment start.
- Private courses exist in the data model, but there is no screen for adding members yet.

## Credits

The demo lectures are from MIT 6.006 Introduction to Algorithms, Spring 2020 (Erik Demaine, Jason Ku, Justin Solomon), MIT OpenCourseWare, https://ocw.mit.edu, licensed CC BY-NC-SA 4.0. Transcripts shown in the app were produced by automatic speech recognition and are not official.
