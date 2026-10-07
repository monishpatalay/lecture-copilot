import { fail, ok, UUID } from "@/lib/api";
import { askerHash } from "@/lib/asker";
import { getViewer } from "@/lib/auth";
import { admin } from "@/lib/supabase-admin"; // questions has no public policies

/** Thumbs up (1), thumbs down (-1) or cleared (0) on an answer. Only the person who asked can set it. */
export async function POST(request: Request, { params }: RouteContext<"/api/questions/[id]/feedback">) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const value: unknown = body?.value;
  if (!UUID.test(id) || (value !== 1 && value !== -1 && value !== 0)) return fail(400, "value must be 1, -1 or 0.");

  const viewer = await getViewer();
  const { data, error } = await admin
    .from("questions")
    .update({ feedback: value === 0 ? null : value })
    .eq("id", id)
    .eq("user_hash", askerHash(request.headers, viewer?.id)) // someone else's question looks like a missing one
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("feedback failed:", error);
    return fail(500, "Couldn't save that. Please try again.");
  }
  return data ? ok({ value }) : fail(404, "Question not found.");
}
