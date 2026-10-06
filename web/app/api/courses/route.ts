import { fail, ok } from "@/lib/api";
import { requireInstructor } from "@/lib/auth";
import { admin } from "@/lib/supabase-admin";

const MAX_TITLE_CHARS = 120;

/** Creates a course owned by the signed-in instructor. Public, so students can watch and ask without an invite. */
export async function POST(request: Request) {
  const viewer = await requireInstructor();
  if (viewer instanceof Response) return viewer;

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title || title.length > MAX_TITLE_CHARS) return fail(400, `Give the course a title of up to ${MAX_TITLE_CHARS} characters.`);

  const { data, error } = await admin
    .from("courses")
    .insert({ title, instructor_id: viewer.id, is_public: true })
    .select("id, title")
    .single();
  if (error) {
    console.error("could not create course:", error);
    return fail(500, "Could not create the course. Please try again.");
  }
  return ok(data, 201);
}
