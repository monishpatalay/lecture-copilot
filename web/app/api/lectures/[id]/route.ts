import { fail, ok, UUID } from "@/lib/api";
import { lectureState } from "@/lib/lecture-state";

/** Where a lecture is in the pipeline. The browser polls this every few seconds. */
export async function GET(_request: Request, ctx: RouteContext<"/api/lectures/[id]">) {
  const { id } = await ctx.params;
  const state = UUID.test(id) ? await lectureState(id) : null;
  return state ? ok(state) : fail(404, "Lecture not found.");
}
