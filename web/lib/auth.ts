import { fail } from "./api";
import { createClient } from "./supabase-server";

export type Viewer = { id: string; email: string; role: "instructor" | "student" };

/** Who is signed in, checked against the auth server (not just read from the cookie), or null. */
export async function getViewer(): Promise<Viewer | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return { id: user.id, email: user.email ?? "", role: profile?.role === "instructor" ? "instructor" : "student" };
}

/** For upload routes: the signed-in instructor, or the response that turns the request away. */
export async function requireInstructor(): Promise<Viewer | Response> {
  const viewer = await getViewer();
  if (!viewer) return fail(401, "Sign in to upload lectures.");
  if (viewer.role !== "instructor") return fail(403, "Only instructors can upload lectures.");
  return viewer;
}
