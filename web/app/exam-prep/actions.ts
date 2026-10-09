"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { UUID } from "@/lib/api";
import { askerHash } from "@/lib/asker";
import { canManage, getViewer } from "@/lib/auth";
import { flash } from "@/lib/flash";
import { complete } from "@/lib/llm";
import {
  buildPracticeMessages,
  buildVerifyMessages,
  cleanEdited,
  cleanPractice,
  keepVerified,
  pickSegments,
  readPractice,
  type PracticeItem,
} from "@/lib/practice";
import { admin } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";

export type PracticeState = { error?: string };

const TRY_AGAIN = "Couldn't write the questions just now. Try again in a minute.";
const CLAIM_MS = 5 * 60 * 1000;

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
    // Claimed before the model is called: without this, parallel or repeated requests (anyone can send
    // them) each spent two model calls. One attempt per lecture every few minutes, whoever asks.
    const claimed = await admin
      .from("lectures")
      .update({ practice_claimed_at: new Date().toISOString() })
      .eq("id", lectureId)
      .or(`practice_claimed_at.is.null,practice_claimed_at.lt.${new Date(Date.now() - CLAIM_MS).toISOString()}`)
      .select("id");
    if (!claimed.data?.length) return { error: "These questions are being written right now. Try again in a few minutes." };
    const chosen = pickSegments(segments);
    let items;
    try {
      const written = cleanPractice((await complete(buildPracticeMessages(chosen))).text, chosen);
      // Only questions that pass a second, blind look are kept.
      items = written.length ? keepVerified(written, (await complete(buildVerifyMessages(chosen, written))).text) : [];
      if (items.length < written.length) console.warn(`practice: dropped ${written.length - items.length} of ${written.length} questions that failed the check`);
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
    // Reports were about the questions that have just been replaced.
    await admin.from("practice_reports").delete().eq("lecture_id", lectureId);
    await flash(replace ? "A new set of questions is ready." : "The practice questions are ready.");
  }
  revalidatePath("/exam-prep");
  return {};
}

/** For the edit actions: the lecture's stored set and the question the form names, if the viewer may change them. */
async function editableItem(form: FormData): Promise<{ lectureId: string; items: PracticeItem[]; index: number }> {
  const lectureId = String(form.get("lectureId") ?? "");
  if (!UUID.test(lectureId)) throw new Error("Not allowed.");
  const { data: lecture } = await admin.from("lectures").select("practice, courses(instructor_id)").eq("id", lectureId).maybeSingle();
  if (!lecture || !canManage(await getViewer(), lecture.courses.instructor_id)) throw new Error("Not allowed.");
  const items = readPractice(lecture.practice);
  const index = items.findIndex((item) => item.t_s === Number(form.get("t_s")));
  if (index < 0) throw new Error("That question no longer exists.");
  return { lectureId, items, index };
}

async function storeItems(lectureId: string, items: PracticeItem[], changedAt: number): Promise<boolean> {
  const { error } = await admin.from("lectures").update({ practice: items }).eq("id", lectureId);
  if (error) {
    console.error("practice: could not save an edit:", error);
    await flash("Couldn't save that. Please try again.", "error");
    return false;
  }
  // The question students reported has been dealt with.
  await admin.from("practice_reports").delete().eq("lecture_id", lectureId).eq("t_s", changedAt);
  return true;
}

/** The course's professor or the admin corrects one question. */
export async function savePracticeItem(form: FormData): Promise<void> {
  const { lectureId, items, index } = await editableItem(form);
  const edited = cleanEdited({
    question: form.get("question"),
    options: [0, 1, 2, 3].map((n) => form.get(`option${n}`)),
    correct: form.get("correct"),
    explanation: form.get("explanation"),
  });
  if (typeof edited === "string") {
    await flash(`Not saved. ${edited}`, "error");
  } else if (await storeItems(lectureId, items.with(index, { ...edited, t_s: items[index].t_s }), items[index].t_s)) {
    await flash("The question has been saved.");
  }
  revalidatePath("/exam-prep");
}

/** The course's professor or the admin removes one question from the set. */
export async function deletePracticeItem(form: FormData): Promise<void> {
  const { lectureId, items, index } = await editableItem(form);
  if (await storeItems(lectureId, items.toSpliced(index, 1), items[index].t_s)) await flash("The question has been deleted.");
  revalidatePath("/exam-prep");
}

/** Anyone doing the quiz can say a question looks wrong. Counted once per person; the professor sees the total. */
export async function reportPracticeItem(form: FormData): Promise<void> {
  const lectureId = String(form.get("lectureId") ?? "");
  const t_s = Number(form.get("t_s"));
  if (!UUID.test(lectureId) || !Number.isInteger(t_s)) throw new Error("Bad request.");

  const supabase = await createClient(); // acts as the viewer, so a lecture they can't see looks like a missing one
  const { data: lecture } = await supabase.from("lectures").select("practice").eq("id", lectureId).maybeSingle();
  if (!lecture || !readPractice(lecture.practice).some((item) => item.t_s === t_s)) throw new Error("That question no longer exists.");

  const viewer = await getViewer();
  const { error } = await admin
    .from("practice_reports")
    .upsert({ lecture_id: lectureId, t_s, user_hash: askerHash(await headers(), viewer?.id) }, { ignoreDuplicates: true });
  if (error) {
    console.error("practice: could not save a report:", error);
    await flash("Couldn't send the report. Please try again.", "error");
  } else {
    await flash("Thanks. The professor will see your report.");
  }
  revalidatePath("/exam-prep");
}
