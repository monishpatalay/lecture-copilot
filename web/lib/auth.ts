import { fail } from "./api";
import { createClient } from "./supabase-server";

export type Viewer = {
  id: string;
  email: string;
  role: "instructor" | "student";
  /** Decides professor access requests on /requests. */
  isAdmin: boolean;
  requestStatus: "pending" | "declined" | null;
};

/** Who is signed in, checked against the auth server (not just read from the cookie), or null. */
export async function getViewer(): Promise<Viewer | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_admin, request_status")
    .eq("id", user.id)
    .maybeSingle();
  const status = profile?.request_status;
  return {
    id: user.id,
    email: user.email ?? "",
    role: profile?.role === "instructor" ? "instructor" : "student",
    isAdmin: profile?.is_admin === true,
    requestStatus: status === "pending" || status === "declined" ? status : null,
  };
}

/** For upload routes: the signed-in instructor, or the response that turns the request away. */
export async function requireInstructor(): Promise<Viewer | Response> {
  const viewer = await getViewer();
  if (!viewer) return fail(401, "Sign in to upload lectures.");
  if (viewer.role !== "instructor") return fail(403, "Only instructors can upload lectures.");
  return viewer;
}

/** A course can be renamed or deleted by the professor who owns it and by the admin. */
export function canManage(viewer: Viewer | null, instructorId: string | null): boolean {
  return viewer !== null && (viewer.isAdmin || viewer.id === instructorId);
}
