import { fail, ok } from "@/lib/api";
import { requireInstructor } from "@/lib/auth";
import { validateNewLecture, type UploadTicket } from "@/lib/lectures";
import { deleteObject, presignUpload } from "@/lib/r2";
import { admin } from "@/lib/supabase-admin";

/** Starts an upload: reserves the lecture and returns a URL the browser PUTs the file to. */
export async function POST(request: Request) {
  const viewer = await requireInstructor();
  if (viewer instanceof Response) return viewer;

  const input = validateNewLecture(await request.json().catch(() => null));
  if (!input.ok) return fail(400, input.error);
  const { courseId, number, title, extension, contentType, fileSize } = input.value;

  // Instructors upload to their own courses only.
  const { data: course } = await admin.from("courses").select("id").eq("id", courseId).eq("instructor_id", viewer.id).maybeSingle();
  if (!course) return fail(404, "Course not found.");

  // An upload that never finished, or a lecture that failed, can be replaced. Anything else keeps its number.
  const { data: existing } = await admin
    .from("lectures")
    .select("id, status, raw_key")
    .eq("course_id", courseId)
    .eq("number", number)
    .maybeSingle();
  if (existing && existing.status !== "uploading" && existing.status !== "failed") {
    return fail(409, `Lecture ${number} already exists in this course.`);
  }
  if (existing?.raw_key) {
    await deleteObject(existing.raw_key).catch((error) => console.error("could not delete replaced upload:", error));
  }

  const id = existing?.id ?? crypto.randomUUID();
  // A fresh key per attempt, so the worker can tell a new file from one it already started on.
  const rawKey = `lectures/${id}/raw-${crypto.randomUUID().slice(0, 8)}.${extension}`;
  const { error } = await admin.from("lectures").upsert({
    id,
    course_id: courseId,
    number,
    title,
    status: "uploading",
    stage: null,
    progress: 0,
    error: null,
    raw_key: rawKey,
    locked_at: new Date().toISOString(), // held by this upload; the worker removes uploads abandoned for a day
  });
  if (error) {
    // 23505: another request took this lecture number between the check and the write.
    if (error.code === "23505") return fail(409, `Lecture ${number} already exists in this course.`);
    console.error("could not create lecture:", error);
    return fail(500, "Could not start the upload. Please try again.");
  }

  const ticket: UploadTicket = { lectureId: id, uploadUrl: await presignUpload(rawKey, contentType, fileSize), contentType };
  return ok(ticket, 201);
}
