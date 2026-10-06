import { fail, ok } from "@/lib/api";
import { lectureState } from "@/lib/lecture-state";
import { ownedLecture } from "@/lib/owned-lecture";
import { wakeProcessor } from "@/lib/processor";
import { admin } from "@/lib/supabase-admin";

/** Puts a failed lecture back in the queue. The worker resumes from the stages that already finished. */
export async function POST(_request: Request, ctx: RouteContext<"/api/lectures/[id]/retry">) {
  const { id } = await ctx.params;
  const lecture = await ownedLecture(id);
  if (lecture instanceof Response) return lecture;

  const { data: requeued } = await admin
    .from("lectures")
    .update({ status: "queued", error: null, locked_at: null })
    .eq("id", id)
    .eq("status", "failed")
    .select("id")
    .maybeSingle();
  if (requeued) await wakeProcessor();
  return requeued ? ok(await lectureState(id)) : fail(409, "Only a failed lecture can be retried.");
}
