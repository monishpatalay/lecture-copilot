import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { generateAnswer, type Answer } from "@/lib/answer";
import { MAX_QUESTION_CHARS, type AskData } from "@/lib/ask-contract";
import type { Database } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

const NOT_COVERED_MESSAGE = "Not covered in these lectures";
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

// Service role, used only to write the question log (that table has no public insert policy).
const admin = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const ok = (data: AskData) => Response.json({ success: true, data, error: null });
const fail = (status: number, error: string) => Response.json({ success: false, data: null, error }, { status });

/** Identifies a visitor without storing who they are. Keyed, so it can't be brute-forced back into an IP. */
function userHash(request: Request): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!).update(ip).digest("hex").slice(0, 32);
}

// ponytail: no rate limit yet. The per-visitor daily cap arrives with the public demo (Phase 3).
export async function POST(request: Request) {
  const startedAt = Date.now();
  const body = await request.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  const courseId: unknown = body?.courseId;
  if (!question || question.length > MAX_QUESTION_CHARS) {
    return fail(400, `Ask a question of up to ${MAX_QUESTION_CHARS} characters.`);
  }
  if (typeof courseId !== "string" || !UUID.test(courseId)) return fail(400, "courseId must be a UUID.");

  // Both run under row-level security, so a private course looks the same as a missing one.
  const [course, embedded] = await Promise.all([
    supabase.from("courses").select("id").eq("id", courseId).maybeSingle(),
    supabase.functions.invoke<{ embedding: number[] }>("embed", { body: { input: question } }),
  ]);
  if (!course.data) return fail(404, "Course not found.");
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
    user_hash: userHash(request),
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
  if (answer.status === "not_covered") return ok({ answer: NOT_COVERED_MESSAGE, covered: false, citations: [] });
  return ok({ answer: answer.text, covered: true, citations: answer.citations });
}
