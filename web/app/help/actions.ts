"use server";

import { headers } from "next/headers";
import { askerHash } from "@/lib/asker";
import { getViewer } from "@/lib/auth";
import { validateHelpMessage } from "@/lib/help";
import { admin } from "@/lib/supabase-admin";

// `values` hands back what was typed when a send fails: the browser clears a form once its action has run,
// and nobody should have to write their message twice.
export type HelpState = { sent?: true; error?: string; values?: Record<"name" | "email" | "topic" | "message", string> };

// Sign-in links go out through the same email account, which allows about 100 emails a day on its free plan.
// These limits keep an open form from using that up.
const PER_PERSON_PER_DAY = 3;
const TOTAL_PER_DAY = 30;
const TRY_LATER = "Couldn't send your message just now. Please try again in a few minutes.";

/** Emails a help request to the site's owner, with the sender's address as reply-to. Nothing written is stored. */
export async function sendHelpMessage(_previous: HelpState, form: FormData): Promise<HelpState> {
  // A field people can't see. Only a script fills it in; it is told the message went through.
  if (form.get("website")) return { sent: true };

  const typed = (key: string) => String(form.get(key) ?? "");
  const values = { name: typed("name"), email: typed("email"), topic: typed("topic"), message: typed("message") };
  const failed = (error: string): HelpState => ({ error, values });

  const help = validateHelpMessage(form);
  if (typeof help === "string") return failed(help);

  const [apiKey, from, to] = [process.env.RESEND_API_KEY, process.env.EMAIL_FROM, process.env.HELP_EMAIL_TO];
  if (!apiKey || !from || !to) {
    console.error("help form: RESEND_API_KEY, EMAIL_FROM and HELP_EMAIL_TO must all be set");
    return failed("The help form isn't set up yet. Please try again later.");
  }

  const viewer = await getViewer();
  const sender = askerHash(await headers(), viewer?.id);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recent = () => admin.from("help_messages").select("id", { count: "exact", head: true }).gte("created_at", since);
  const [mine, everyone] = await Promise.all([recent().eq("user_hash", sender), recent()]);
  if (mine.error || everyone.error) {
    console.error("help form: could not count recent messages:", mine.error ?? everyone.error);
    return failed(TRY_LATER);
  }
  if ((mine.count ?? 0) >= PER_PERSON_PER_DAY) {
    return failed(`You've sent ${PER_PERSON_PER_DAY} messages today, which is the limit. You'll get a reply by email.`);
  }
  if ((everyone.count ?? 0) >= TOTAL_PER_DAY) return failed("The help inbox is full for today. Please try again tomorrow.");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      // A named User-Agent: Resend's firewall has refused requests with a default one.
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "User-Agent": "lecture-copilot-web" },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: help.email,
        subject: `Help: ${help.topic}`,
        text: [
          help.message,
          "",
          "—",
          `From: ${help.name} <${help.email}>`,
          `Topic: ${help.topic}`,
          `Account: ${viewer ? `${viewer.email} (${viewer.isAdmin ? "admin" : viewer.role === "instructor" ? "professor" : "user"})` : "not signed in"}`,
          "Reply to this email to answer them.",
        ].join("\n"),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`help form: Resend answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return failed(TRY_LATER);
    }
  } catch (error) {
    console.error("help form: could not reach Resend:", error);
    return failed(TRY_LATER);
  }

  // Counted only once the email has gone, so a failed send doesn't use up someone's allowance.
  const { error } = await admin.from("help_messages").insert({ user_hash: sender });
  if (error) console.error("help form: sent, but could not record it for the daily limit:", error);
  return { sent: true };
}
