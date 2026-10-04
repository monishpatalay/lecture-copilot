import { fail, ok } from "@/lib/api";
import { lectureState } from "@/lib/lecture-state";
import { MAX_UPLOAD_BYTES } from "@/lib/lectures";
import { ownedLecture } from "@/lib/owned-lecture";
import { deleteObject, objectSize } from "@/lib/r2";
import { admin } from "@/lib/supabase-admin";

/** Called by the browser once its PUT finished: checks the file really arrived, then queues the lecture. */
export async function POST(_request: Request, ctx: RouteContext<"/api/lectures/[id]/complete">) {
  const { id } = await ctx.params;
  const lecture = await ownedLecture(id);
  if (lecture instanceof Response) return lecture;
  if (lecture.status !== "uploading" || !lecture.raw_key) return fail(409, "This lecture isn't waiting for an upload.");

  const size = await objectSize(lecture.raw_key);
  if (size === null) return fail(409, "The upload didn't arrive. Please try again.");
  if (size > MAX_UPLOAD_BYTES) {
    // The browser said it was smaller. Don't keep it, and don't spend a worker on it.
    await deleteObject(lecture.raw_key);
    await admin.from("lectures").update({ status: "failed", error: "That file is larger than 2 GB.", raw_key: null }).eq("id", id);
    return fail(413, "That file is larger than 2 GB.");
  }

  const { error } = await admin.from("lectures").update({ status: "queued" }).eq("id", id).eq("status", "uploading");
  if (error) {
    console.error("could not queue lecture:", error);
    return fail(500, "Could not queue the lecture. Please try again.");
  }
  return ok(await lectureState(id));
}
