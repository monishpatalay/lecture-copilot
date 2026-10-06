"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { UUID } from "@/lib/api";
import { canManage, getViewer } from "@/lib/auth";
import { deletePrefix } from "@/lib/r2";
import { admin } from "@/lib/supabase-admin";

const MAX_TITLE_CHARS = 120;

/** The course and its lectures, if the viewer may change it (its professor, or the admin). Throws otherwise. */
async function manageableCourse(form: FormData) {
  const courseId = String(form.get("courseId") ?? "");
  const viewer = await getViewer();
  if (!viewer || !UUID.test(courseId)) throw new Error("Not allowed.");
  const { data: course } = await admin
    .from("courses")
    .select("id, instructor_id, lectures(id, status)")
    .eq("id", courseId)
    .maybeSingle();
  if (!course || !canManage(viewer, course.instructor_id)) throw new Error("Not allowed.");
  return course;
}

function titleFrom(form: FormData): string {
  const title = String(form.get("title") ?? "").trim();
  if (!title || title.length > MAX_TITLE_CHARS) throw new Error(`Titles need 1 to ${MAX_TITLE_CHARS} characters.`);
  return title;
}

/** Storage first, then the row: if storage fails the lecture is still listed and can be deleted again. */
async function removeLecture(lectureId: string) {
  await deletePrefix(`lectures/${lectureId}/`);
  const { error } = await admin.from("lectures").delete().eq("id", lectureId);
  if (error) throw new Error(`Could not delete the lecture: ${error.message}`);
}

export async function renameCourse(form: FormData): Promise<void> {
  const course = await manageableCourse(form);
  const { error } = await admin.from("courses").update({ title: titleFrom(form) }).eq("id", course.id);
  if (error) throw new Error(`Could not rename the course: ${error.message}`);
  revalidatePath("/", "layout");
}

export async function renameLecture(form: FormData): Promise<void> {
  const course = await manageableCourse(form);
  const lecture = course.lectures.find((l) => l.id === form.get("lectureId"));
  if (!lecture) throw new Error("Lecture not found.");
  const { error } = await admin.from("lectures").update({ title: titleFrom(form) }).eq("id", lecture.id);
  if (error) throw new Error(`Could not rename the lecture: ${error.message}`);
  revalidatePath("/", "layout");
}

export async function deleteLecture(form: FormData): Promise<void> {
  const course = await manageableCourse(form);
  const lecture = course.lectures.find((l) => l.id === form.get("lectureId"));
  if (!lecture) throw new Error("Lecture not found.");
  // The worker is writing this lecture's files and rows right now; deleting under it would leave strays.
  if (lecture.status === "processing") throw new Error("This lecture is being processed. Delete it once that finishes.");
  await removeLecture(lecture.id);
  revalidatePath("/", "layout");
}

export async function deleteCourse(form: FormData): Promise<void> {
  const course = await manageableCourse(form);
  if (course.lectures.some((l) => l.status === "processing")) {
    throw new Error("A lecture in this course is being processed. Delete the course once that finishes.");
  }
  for (const lecture of course.lectures) await removeLecture(lecture.id);
  const { error } = await admin.from("courses").delete().eq("id", course.id); // questions go with it
  if (error) throw new Error(`Could not delete the course: ${error.message}`);
  revalidatePath("/", "layout");
  redirect("/");
}
