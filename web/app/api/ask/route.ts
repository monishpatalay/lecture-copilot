import { generateAnswer, generateOutlineAnswer, isRelevant, type Answer } from "@/lib/answer";
import { fail, UUID, type ApiResponse } from "@/lib/api";
import { askerHash } from "@/lib/asker";
import { MAX_QUESTION_CHARS, type AskData, type AskStreamEvent, type Source } from "@/lib/ask-contract";
import { getViewer } from "@/lib/auth";
import type { ResolvedCitation, Segment } from "@/lib/citations";
import { cleanHistory, standaloneQuestion } from "@/lib/followup";
import type { StreamHandlers } from "@/lib/llm";
import { outlineSegments, outlineText } from "@/lib/overview";
import { refineCitations, type Line } from "@/lib/refine";
import { CANDIDATES, rerank } from "@/lib/rerank";
import { admin } from "@/lib/supabase-admin"; // only for the question log, which has no public policies
import { createClient } from "@/lib/supabase-server";

const NOT_COVERED_MESSAGE = "Not covered in these lectures";
const ANONYMOUS_DAILY_LIMIT = 20; // questions per visitor per day without signing in
// Anyone can sign up, and every answer spends free-tier model quota: far above what studying takes, well below abuse.
const SIGNED_IN_DAILY_LIMIT = 200;
/** One person's daily total across every course is this many times the per-course limit. */
const ALL_COURSES_MULTIPLE = 3;
const EXCERPT_CHARS = 180;

type Outcome = { status: number; body: ApiResponse<AskData> };
const failure = (status: number, error: string): Outcome => ({ status, body: { success: false, data: null, error } });

function sourcesFor(citations: ResolvedCitation[], segments: Segment[]): Source[] {
  const cited = new Set(citations.map((c) => c.segmentId));
  return segments
    .filter((s) => cited.has(s.id))
    .sort((a, b) => a.lecture_number - b.lecture_number || a.start_s - b.start_s)
    .map((s) => ({
      segmentId: s.id,
      lectureId: s.lecture_id,
      lectureNumber: s.lecture_number,
      startS: s.start_s,
      endS: s.end_s,
      excerpt: s.transcript.length > EXCERPT_CHARS ? `${s.transcript.slice(0, EXCERPT_CHARS).trimEnd()}…` : s.transcript,
    }));
}

/** A lecture's transcript lines from storage, or null: without them citations just stay at their segment starts. */
async function transcriptLines(lectureId: string): Promise<Line[] | null> {
  try {
    const res = await fetch(`${process.env.R2_PUBLIC_BASE_URL}/lectures/${lectureId}/transcript.json`);
    const lines: unknown = res.ok ? await res.json() : null;
    return Array.isArray(lines) ? lines : null;
  } catch {
    return null;
  }
}

/** Points each citation at the sentence it supports instead of the start of its segment. */
async function sharpen(text: string, citations: ResolvedCitation[], segments: Segment[]): Promise<ResolvedCitation[]> {
  const lectureIds = [...new Set(citations.map((c) => c.lectureId))];
  const loaded = await Promise.all(lectureIds.map(transcriptLines));
  const linesByLecture = new Map(lectureIds.flatMap((id, i) => (loaded[i] ? [[id, loaded[i]] as const] : [])));
  return refineCitations(text, citations, segments, linesByLecture);
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const body = await request.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  const courseId: unknown = body?.courseId;
  if (!question || question.length > MAX_QUESTION_CHARS) {
    return fail(400, `Ask a question of up to ${MAX_QUESTION_CHARS} characters.`);
  }
  if (typeof courseId !== "string" || !UUID.test(courseId)) return fail(400, "courseId must be a UUID.");
  const history = cleanHistory(body?.history);

  const supabase = await createClient(); // acts as the viewer, so a course they can't see looks like a missing one
  const embed = (input: string) => supabase.functions.invoke<{ embedding: number[] }>("embed", { body: { input } });
  // A first question is searched as typed, so its embedding can start now. A follow-up is rewritten first.
  const earlyEmbedding = history.length === 0 ? embed(question) : null;
  const [course, viewer] = await Promise.all([supabase.from("courses").select("id, title").eq("id", courseId).maybeSingle(), getViewer()]);
  if (!course.data) return fail(404, "Course not found.");
  const courseTitle = course.data.title;

  const asker = askerHash(request.headers, viewer?.id);
  // The eval runner sends the service role key so a 150-question run isn't cut off at 20.
  const isEvalRun = request.headers.get("x-eval-key") === process.env.SUPABASE_SERVICE_ROLE_KEY;
  // The question is logged first and counted after. Counting first let a burst of parallel requests all
  // read the same count and pass; this way each one sees the others. The row is filled in once answered.
  let questionId: string | null = null;
  if (!isEvalRun) {
    const placed = await admin
      .from("questions")
      .insert({ course_id: courseId as string, user_hash: asker, text: question })
      .select("id")
      .single();
    if (placed.error) console.error("question log failed:", placed.error);
    questionId = placed.data?.id ?? null;

    const limit = viewer ? SIGNED_IN_DAILY_LIMIT : ANONYMOUS_DAILY_LIMIT;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const asked = () =>
      admin.from("questions").select("id", { count: "exact", head: true }).eq("user_hash", asker).gte("created_at", since);
    const [inCourse, everywhere] = await Promise.all([asked().eq("course_id", courseId as string), asked()]);
    if ((inCourse.count ?? 0) > limit || (everywhere.count ?? 0) > limit * ALL_COURSES_MULTIPLE) {
      if (questionId) await admin.from("questions").delete().eq("id", questionId);
      return fail(
        429,
        viewer
          ? `You've asked ${limit} questions in this course today, which is the daily limit. Come back tomorrow.`
          : `You've asked ${limit} questions today, which is the limit without signing in. Sign in to keep going.`,
      );
    }
  }

  /** Search, write, check and log. The same for both kinds of response; `stream` only adds the live text. */
  async function answerQuestion(stream?: StreamHandlers): Promise<Outcome> {
    // "Explain that more simply" means nothing to a search, so a follow-up becomes a complete question first.
    const asked = history.length ? await standaloneQuestion(history, question) : question;
    const embedded = await (earlyEmbedding ?? embed(asked));
    if (embedded.error || !embedded.data) {
      console.error("embed function failed:", embedded.error);
      return failure(502, "Search is unavailable right now. Please try again in a minute.");
    }
    const search = await supabase.rpc("match_segments", {
      query_embedding: JSON.stringify(embedded.data.embedding),
      query_text: asked,
      p_course_id: courseId as string,
      k: CANDIDATES,
    });
    if (search.error) {
      console.error("match_segments failed:", search.error);
      return failure(502, "Search is unavailable right now. Please try again in a minute.");
    }
    // Search casts a wide net; a small model then picks the six passages the answer is written from.
    // Skipped when nothing is close to the question: that case never reaches a model at all.
    const segments = isRelevant(search.data) ? await rerank(asked, search.data) : search.data.slice(0, 6);
    if (isEvalRun && body?.retrieveOnly === true) {
      // For evals/run_eval.py --served: what the answer model would be given, without writing an answer.
      return { status: 200, body: { success: true, data: { segments } as unknown as AskData, error: null } };
    }

    let answer: Answer | null = null; // stays null if both LLM providers fail
    try {
      // A follow-up asks for something different from the last answer (simpler, an example, more detail);
      // without this nudge the fallback model tends to repeat the same sentences.
      const prompt = history.length
        ? `${asked}\n(This is a follow-up to an earlier answer. Give what is asked for; do not repeat that answer in the same words.)`
        : asked;
      answer = await generateAnswer(prompt, segments, stream);
    } catch (error) {
      console.error("answer generation failed:", error);
    }
    // The lectures' words don't answer it. It may be a question about the course itself ("how many
    // lectures are there?"), which the outline of lecture titles and chapters can answer.
    let fromOutline = false;
    if (answer?.status === "not_covered") {
      const lectures = await supabase
        .from("lectures")
        .select("id, number, title, duration_s, chapters")
        .eq("course_id", courseId as string)
        .eq("status", "ready")
        .order("number");
      if (lectures.data?.length) {
        try {
          stream?.onRestart();
          const outlined = await generateOutlineAnswer(asked, outlineText(courseTitle, lectures.data), outlineSegments(lectures.data), stream);
          if (outlined.status === "answered") {
            answer = outlined;
            fromOutline = true;
          }
        } catch (error) {
          console.error("outline answer failed:", error); // the question stays "not covered"
        }
      }
    }
    const answered = answer?.status === "answered" ? answer : null;
    // An outline answer cites lectures and chapters, not transcript passages: nothing to sharpen or excerpt.
    const citations = !answered ? [] : fromOutline ? answered.citations : await sharpen(answered.text, answered.citations, segments);

    // Eval runs are not students: logging them would fill the professor's Insights with test questions.
    const logged = questionId ? { id: questionId } : null;
    const { error: logError } = !questionId ? { error: null } : await admin.from("questions").update({
      answer: answered?.text ?? null,
      cited_segment_ids: fromOutline ? [] : [...new Set(citations.map((c) => c.segmentId))],
      covered: !answer || answer.status === "unverifiable" ? null : answer.status === "answered",
      latency_ms: Date.now() - startedAt,
      model: answer?.model ?? null,
    }).eq("id", questionId);
    if (logError) console.error("question log failed:", logError);

    if (!answer) return failure(502, "The answer service is unavailable right now. Please try again in a minute.");
    if (answer.status === "unverifiable") {
      return failure(502, "I couldn't write an answer with citations I could verify. Try rephrasing the question.");
    }
    const data: AskData =
      answer.status === "not_covered"
        ? { questionId: logged?.id ?? null, answer: NOT_COVERED_MESSAGE, covered: false, citations: [], sources: [], model: answer.model }
        : {
            questionId: logged?.id ?? null,
            answer: answer.text,
            covered: true,
            citations,
            sources: fromOutline ? [] : sourcesFor(citations, segments),
            model: answer.model,
          };
    // An eval run also gets the passages this answer was written from, so it can judge the answer against
    // exactly those (a second retrieval call could be reranked differently).
    const served = isEvalRun ? ({ ...data, evalSegments: segments } as AskData) : data;
    return { status: 200, body: { success: true, data: served, error: null } };
  }

  if (body?.stream !== true) {
    const outcome = await answerQuestion();
    return Response.json(outcome.body, { status: outcome.status });
  }

  // Newline-delimited JSON: text as it is written, then the checked result (see AskStreamEvent).
  const encoder = new TextEncoder();
  const events = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AskStreamEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      let outcome: Outcome;
      try {
        outcome = await answerQuestion({ onDelta: (text) => send({ type: "delta", text }), onRestart: () => send({ type: "restart" }) });
      } catch (error) {
        console.error("ask failed mid-stream:", error);
        outcome = failure(500, "Something went wrong. Please try again.");
      }
      send({ type: "done", ...outcome.body });
      controller.close();
    },
  });
  return new Response(events, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
