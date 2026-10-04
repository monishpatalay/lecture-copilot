"use server";

import { createClient } from "@/lib/supabase-server";

export type LoginState = { sent?: string; error?: string };

export async function sendSignInLink(_previous: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) return { error: "Enter a valid email address." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email });
  if (error) {
    console.error("sign-in link failed:", error.message);
    return { error: "Couldn't send the link. Wait a minute and try again." };
  }
  return { sent: email };
}
