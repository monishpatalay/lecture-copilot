import type { Instrumentation } from "next";

const QUIET_MS = 10 * 60 * 1000;
let lastSentAt = 0;

/**
 * Emails the owner when a page or route throws on the server, using the Help form's Resend settings.
 * ponytail: at most one email per 10 minutes per server instance, so a crash loop can't flood the inbox
 * or Resend's free 100 a day. A real error tracker (grouping, history) is the upgrade if this gets noisy.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { RESEND_API_KEY: key, EMAIL_FROM: from, HELP_EMAIL_TO: to } = process.env;
  if (!key || !from || !to || Date.now() - lastSentAt < QUIET_MS) return;
  lastSentAt = Date.now();

  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  const digest = typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : "none";
  // The query string is dropped: sign-in links carry a token in it.
  const path = request.path.split("?")[0];
  try {
    const sent = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "User-Agent": "lecture-copilot-web" },
      body: JSON.stringify({
        from,
        to,
        subject: `Site error: ${request.method} ${path}`,
        text: `${request.method} ${path}\nRoute: ${context.routePath} (${context.routeType})\nDigest: ${digest}\n\n${message.slice(0, 4000)}`,
      }),
    });
    if (!sent.ok) console.error("error alert not sent:", sent.status, await sent.text());
  } catch (failure) {
    console.error("error alert not sent:", failure);
  }
};
