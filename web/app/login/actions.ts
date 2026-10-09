"use server";

import { headers } from "next/headers";
import { askerHash } from "@/lib/asker";
import { admin } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";

export type LoginState = { sent?: string; error?: string };

const PER_PERSON_PER_HOUR = 5; // sign-in links per visitor (by IP address)

export async function sendSignInLink(_previous: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) return { error: "Enter a valid email address." };

  // Logged first and counted after, so a burst of parallel requests can't all slip under the limit.
  const visitor = askerHash(await headers(), undefined);
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const logged = await admin.from("sign_in_requests").insert({ user_hash: visitor });
  const recent = await admin
    .from("sign_in_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_hash", visitor)
    .gte("created_at", since);
  if (logged.error || recent.error) {
    console.error("sign-in link: could not count recent requests:", logged.error ?? recent.error);
    return { error: "Couldn't send the link. Wait a minute and try again." };
  }
  if ((recent.count ?? 0) > PER_PERSON_PER_HOUR) {
    return { error: "You've asked for several sign-in links in the last hour. Check your inbox, or try again later." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email });
  if (error) {
    console.error("sign-in link failed:", error.message);
    return { error: "Couldn't send the link. Wait a minute and try again." };
  }
  return { sent: email };
}
