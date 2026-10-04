import { createHmac } from "node:crypto";
import { generateAnswer, type Answer } from "@/lib/answer";
import { fail, ok, UUID } from "@/lib/api";
import { MAX_QUESTION_CHARS, type AskData, type Source } from "@/lib/ask-contract";
import { getViewer } from "@/lib/auth";
import type { Segment } from "@/lib/citations";
import { admin } from "@/lib/supabase-admin"; // only for the question log, which has no public policies
import { createClient } from "@/lib/supabase-server";

const NOT_COVERED_MESSAGE = "Not covered in these lectures";
const ANONYMOUS_DAILY_LIMIT = 20; // questions per visitor per day without signing in
const EXCERPT_CHARS = 180;

/** Identifies an asker without storing who they are. Keyed, so it can't be brute-forced back into an IP or user id. */
function hashOf(identity: string): string {
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!).update(identity).digest("hex").slice(0, 32);
}

function sourcesFor(answer: Extract<Answer, { status: "answered" }>, segments: Segment[]): Source[] {
  const cited = new Set(answer.citations.map((c) => c.segmentId));
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

export async function POST(request: Request) {
  const startedAt = Date.now();
  const body = await request.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  const courseId: unknown = body?.courseId;
  if (!question || question.length > MAX_QUESTION_CHARS) {
    return fail(400, `Ask a question of up to ${MAX_QUESTION_CHARS} characters.`);
  }
  if (typeof courseId !== "string" || !UUID.test(courseId)) return fail(400, "courseId must be a UUID.");

  const supabase = await createClient(); // acts as the viewer, so a course they can't see looks like a missing one
  const [course, embedded, viewer] = await Promise.all([
    supabase.from("courses").select("id").eq("id", courseId).maybeSingle(),
    supabase.functions.invoke<{ embedding: number[] }>("embed", { body: { input: question } }),
    getViewer(),
  ]);
  if (!course.data) return fail(404, "Course not found.");

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const asker = hashOf(viewer?.id ?? ip);
  // The eval runner sends the service role key so a 150-question run isn't cut off at 20.
  const isEvalRun = request.headers.get("x-eval-key") === process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!viewer && !isEvalRun) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("course_id", courseId)
      .eq("user_hash", asker)
      .gte("created_at", since);
    if ((count ?? 0) >= ANONYMOUS_DAILY_LIMIT) {
      return fail(429, `You've asked ${ANONYMOUS_DAILY_LIMIT} questions today, which is the limit without signing in. Sign in to keep going.`);
    }
  }

  if (embedded.error || !embedded.data) {
    console.error("embed function failed:", embedded.error);
    return fail(502, "Search is unavailable right now. Please try again in a minute.");
  }
  const search = await supabase.rpc("match_segments", {
    query_embedding: JSON.stringify(embedded.data.embedding),
    query_text: question,
    p_course_id: courseId,
  });
  if (search.error) {
    console.error("match_segments failed:", search.error);
    return fail(502, "Search is unavailable right now. Please try again in a minute.");
  }

  let answer: Answer | null = null; // stays null if both LLM providers fail
  try {
    answer = await generateAnswer(question, search.data);
  } catch (error) {
    console.error("answer generation failed:", error);
  }

  const answered = answer?.status === "answered" ? answer : null;
  const { error: logError } = await admin.from("questions").insert({
    course_id: courseId,
    user_hash: asker,
    text: question,
    answer: answered?.text ?? null,
    cited_segment_ids: [...new Set(answered?.citations.map((c) => c.segmentId))],
    covered: !answer || answer.status === "unverifiable" ? null : answer.status === "answered",
    latency_ms: Date.now() - startedAt,
    model: answer?.model ?? null,
  });
  if (logError) console.error("question log failed:", logError);

  if (!answer) return fail(502, "The answer service is unavailable right now. Please try again in a minute.");
  if (answer.status === "unverifiable") {
    return fail(502, "I couldn't write an answer with citations I could verify. Try rephrasing the question.");
  }
  if (answer.status === "not_covered") {
    return ok<AskData>({ answer: NOT_COVERED_MESSAGE, covered: false, citations: [], sources: [], model: answer.model });
  }
  return ok<AskData>({
    answer: answer.text,
    covered: true,
    citations: answer.citations,
    sources: sourcesFor(answer, search.data),
    model: answer.model,
  });
}
