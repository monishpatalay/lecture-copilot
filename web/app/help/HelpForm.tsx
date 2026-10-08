"use client";

import { useActionState } from "react";
import { MAX_MESSAGE_CHARS, TOPICS } from "@/lib/help";
import { sendHelpMessage, type HelpState } from "./actions";

const FIELD = "w-full rounded-2xl bg-canvas px-5 py-3 text-[15px] font-normal placeholder:text-muted";

export function HelpForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<HelpState, FormData>(sendHelpMessage, {});

  const kept = state.values; // what was typed, after a failed send
  if (state.sent) {
    return (
      <p role="status" className="rounded-2xl bg-lime px-5 py-4 font-semibold">
        Your message has been sent. You&apos;ll get a reply at the email address you gave.
      </p>
    );
  }
  return (
    <form action={action} className="grid gap-5">
      {state.error && (
        <p role="alert" className="rounded-2xl bg-red-50 px-5 py-3 text-sm font-semibold text-red-900">
          {state.error}
        </p>
      )}
      <label className="grid gap-2 text-sm font-bold">
        Your name
        <input name="name" type="text" required maxLength={80} autoComplete="name" defaultValue={kept?.name} className={FIELD} />
      </label>
      <label className="grid gap-2 text-sm font-bold">
        Your email
        <input
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          defaultValue={kept?.email ?? email}
          placeholder="you@university.edu"
          className={FIELD}
        />
      </label>
      <label className="grid gap-2 text-sm font-bold">
        What is it about?
        {/* key: a select only reads its default when it is created, so it is recreated with the kept choice */}
        <select key={kept?.topic ?? ""} name="topic" required defaultValue={kept?.topic ?? ""} className={FIELD}>
          <option value="" disabled>
            Choose a topic
          </option>
          {TOPICS.map((topic) => (
            <option key={topic}>{topic}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-2 text-sm font-bold">
        Your message
        <textarea
          name="message"
          required
          maxLength={MAX_MESSAGE_CHARS}
          rows={6}
          defaultValue={kept?.message}
          placeholder="What happened, and what did you expect? If it's about a lecture, say which one."
          className={FIELD}
        />
      </label>
      {/* Hidden from people and from screen readers; only scripts that fill every field touch it. */}
      <input name="website" type="text" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-full bg-lime px-8 py-3.5 text-[15px] font-bold transition-colors hover:bg-ink hover:text-lime disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
