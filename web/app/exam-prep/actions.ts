"use server";

import { revalidatePath } from "next/cache";
import { UUID } from "@/lib/api";
import { canManage, getViewer } from "@/lib/auth";
import { complete } from "@/lib/llm";
import { buildPracticeMessages, cleanPractice, pickSegments, readPractice } from "@/lib/practice";
import { admin } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";

export type PracticeState = { error?: string };

const TRY_AGAIN = "Couldn't write the questions just now. Try again in a minute.";

/**
 * Writes a lecture's practice questions the first time anyone asks for them; after that they are stored.
 * The course's professor and the admin can replace a stored set (`replace` in the form).
 */
export async function generatePractice(_previous: PracticeState, form: FormData): Promise<PracticeState> {
  const lectureId = String(form.get("lectureId") ?? "");
  if (!UUID.test(lectureId)) return { error: "Unknown lecture." };

  const supabase = await createClient(); // acts as the viewer, so a lecture they can't see looks like a missing one
  const { data: lecture } = await supabase
    .from("lectures")
    .select("status, practice, courses(instructor_id)")
    .eq("id", lectureId)
    .maybeSingle();
  if (!lecture || lecture.status !== "ready") return { error: "Unknown lecture." };

  const replace = form.get("replace") === "1" && canManage(await getViewer(), lecture.courses.instructor_id);
  // Someone else may have generated them since this page was rendered: one model call per lecture.
  if (replace || readPractice(lecture.practice).length === 0) {
    const { data: segments, error } = await supabase
      .from("segments")
      .select("start_s, transcript")
      .eq("lecture_id", lectureId)
      .order("start_s");
    if (error || !segments.length) {
      console.error("practice: could not load segments:", error);
      return { error: TRY_AGAIN };
    }
    const chosen = pickSegments(segments);
    let items;
    try {
      items = cleanPractice((await complete(buildPracticeMessages(chosen))).text, chosen);
    } catch (cause) {
      console.error("practice: generation failed:", cause);
      return { error: TRY_AGAIN };
    }
    if (items.length === 0) {
      console.warn("practice: the model's reply had no usable questions");
      return { error: TRY_AGAIN };
    }
    const saved = await admin.from("lectures").update({ practice: items }).eq("id", lectureId);
    if (saved.error) {
      console.error("practice: could not save:", saved.error);
      return { error: TRY_AGAIN };
    }
  }
  revalidatePath("/exam-prep");
  return {};
}
