"use server";

import { revalidatePath } from "next/cache";
import { validateAccessRequest } from "@/lib/access-request";
import { UUID } from "@/lib/api";
import { getViewer } from "@/lib/auth";
import { admin } from "@/lib/supabase-admin";

export type RequestState = { error?: string };

/** A signed-in student asks to become a professor. One open request per account; a declined one can be sent again. */
export async function requestAccess(_previous: RequestState, form: FormData): Promise<RequestState> {
  const viewer = await getViewer();
  if (!viewer) return { error: "Sign in before requesting access." };
  if (viewer.role === "instructor") return { error: "You are already a professor." };
  if (viewer.requestStatus === "pending") return { error: "Your request is already with the admin." };

  const request = validateAccessRequest(form);
  if (typeof request === "string") return { error: request };

  const { error } = await admin
    .from("profiles")
    .update({
      display_name: request.name,
      request_affiliation: request.affiliation,
      request_note: request.note,
      request_status: "pending",
      requested_at: new Date().toISOString(),
    })
    .eq("id", viewer.id);
  if (error) {
    console.error("could not save access request:", error);
    return { error: "Couldn't send the request. Please try again." };
  }
  revalidatePath("/", "layout");
  return {};
}

/** The admin approves or declines a pending request. */
export async function decideRequest(form: FormData): Promise<void> {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) throw new Error("Only the admin can decide access requests.");

  const id = String(form.get("id") ?? "");
  const decision = form.get("decision");
  if (!UUID.test(id) || (decision !== "approve" && decision !== "decline")) throw new Error("Bad request.");

  const { error } = await admin
    .from("profiles")
    .update(decision === "approve" ? { role: "instructor", request_status: null } : { request_status: "declined" })
    .eq("id", id)
    .eq("request_status", "pending");
  if (error) {
    console.error("could not decide access request:", error);
    throw new Error("Could not save the decision.");
  }
  revalidatePath("/", "layout");
}
