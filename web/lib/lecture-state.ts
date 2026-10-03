import type { LectureState } from "./lectures";
import { supabase } from "./supabase";
import { admin } from "./supabase-admin";

const OFFLINE_AFTER_MS = 60_000;

/** True when a queue worker has checked in within the last minute. */
export async function isWorkerOnline(): Promise<boolean> {
  const { data } = await admin
    .from("worker_heartbeats")
    .select("last_seen_at")
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data !== null && Date.now() - Date.parse(data.last_seen_at) < OFFLINE_AFTER_MS;
}

/** Where a lecture is in the pipeline, or null if it doesn't exist (or isn't in a public course). */
export async function lectureState(id: string): Promise<LectureState | null> {
  const [lecture, workerOnline] = await Promise.all([
    // Anon client on purpose: row-level security decides which lectures are visible.
    supabase.from("lectures").select("id, course_id, number, title, status, stage, progress, error").eq("id", id).maybeSingle(),
    isWorkerOnline(),
  ]);
  if (!lecture.data) return null;
  const { course_id, ...rest } = lecture.data;
  return { ...rest, courseId: course_id, workerOnline };
}
