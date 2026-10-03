import { fail, ok, uploadsDisabled, UUID } from "@/lib/api";
import { lectureState } from "@/lib/lecture-state";
import { admin } from "@/lib/supabase-admin";

/** Puts a failed lecture back in the queue. The worker resumes from the stages that already finished. */
export async function POST(_request: Request, ctx: RouteContext<"/api/lectures/[id]/retry">) {
  const blocked = uploadsDisabled();
  if (blocked) return blocked;

  const { id } = await ctx.params;
  if (!UUID.test(id)) return fail(404, "Lecture not found.");
  const { data: requeued } = await admin
    .from("lectures")
    .update({ status: "queued", error: null, locked_at: null })
    .eq("id", id)
    .eq("status", "failed")
    .select("id")
    .maybeSingle();

  const state = await lectureState(id);
  if (!state) return fail(404, "Lecture not found.");
  return requeued ? ok(state) : fail(409, "Only a failed lecture can be retried.");
}
