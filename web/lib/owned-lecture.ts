import { fail, UUID } from "./api";
import { requireInstructor } from "./auth";
import { admin } from "./supabase-admin";

/** For routes that change a lecture: the lecture, if the signed-in instructor owns its course; else the refusal. */
export async function ownedLecture(id: string) {
  const viewer = await requireInstructor();
  if (viewer instanceof Response) return viewer;
  if (!UUID.test(id)) return fail(404, "Lecture not found.");
  const { data: lecture } = await admin
    .from("lectures")
    .select("id, status, raw_key, courses!inner(instructor_id)")
    .eq("id", id)
    .eq("courses.instructor_id", viewer.id)
    .maybeSingle();
  return lecture ?? fail(404, "Lecture not found.");
}
