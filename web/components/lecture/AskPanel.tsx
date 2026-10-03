"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { MAX_QUESTION_CHARS, type AskData, type AskResponse } from "@/lib/ask-contract";
import { citationText, splitByCitations } from "@/lib/citations";

type Reply = ({ ok: true } & AskData) | { ok: false; error: string };
type Entry = { question: string; reply: Reply | null }; // reply is null while waiting

const CHIP =
  "mx-0.5 inline-block rounded-full bg-lime px-2.5 py-0.5 text-xs font-bold whitespace-nowrap tabular-nums transition-colors hover:bg-ink hover:text-lime";

async function fetchReply(question: string, courseId: string): Promise<Reply> {
  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, courseId }),
    });
    const body: AskResponse = await res.json();
    return body.success ? { ok: true, ...body.data } : { ok: false, error: body.error };
  } catch {
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

function ReplyView({
  reply,
  lectureId,
  onSeek,
}: {
  reply: Reply | null;
  lectureId: string;
  onSeek: (seconds: number) => void;
}) {
  if (!reply) return <p className="text-sm text-muted motion-safe:animate-pulse">Searching the lectures…</p>;
  if (!reply.ok) {
    return (
      <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-900">
        {reply.error}
      </p>
    );
  }
  if (!reply.covered) {
    return (
      <p className="rounded-2xl border border-dashed border-ink/25 px-4 py-3 text-sm font-semibold text-muted">
        {reply.answer}
      </p>
    );
  }

  // Only citations the server validated become chips; anything else stays plain text.
  const validated = new Map(reply.citations.map((citation) => [citation.raw, citation]));
  return (
    <p className="whitespace-pre-wrap">
      {splitByCitations(reply.answer).map((part, i) => {
        const citation = typeof part === "string" ? undefined : validated.get(part.raw);
        if (!citation) return typeof part === "string" ? part : part.raw;
        const text = citationText(citation.lectureNumber, citation.seconds);
        return citation.lectureId === lectureId ? (
          <button
            key={i}
            type="button"
            onClick={() => onSeek(citation.seconds)}
            title="Jump to this moment"
            className={CHIP}
          >
            {text}
          </button>
        ) : (
          <Link key={i} href={`/lectures/${citation.lectureId}?t=${citation.seconds}`} className={CHIP}>
            {text} ↗
          </Link>
        );
      })}
    </p>
  );
}

export function AskPanel({
  courseId,
  lectureId,
  onSeek,
  className = "",
}: {
  courseId: string;
  lectureId: string;
  onSeek: (seconds: number) => void;
  className?: string;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const waiting = entries.at(-1)?.reply === null;

  useEffect(() => {
    // Keep the newest exchange in view. Scrolls the list only, never the page.
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [entries]);

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = draft.trim();
    if (!question || waiting) return;
    setDraft("");
    setEntries((prev) => [...prev, { question, reply: null }]);
    const reply = await fetchReply(question, courseId);
    // One request at a time, so the waiting entry is always the last one.
    setEntries((prev) => prev.map((entry, i) => (i === prev.length - 1 ? { ...entry, reply } : entry)));
  }

  return (
    <section aria-labelledby="ask-heading" className={`flex flex-col rounded-card bg-card shadow-card ${className}`}>
      <header className="px-6 pt-6">
        <h2 id="ask-heading" className="text-2xl font-extrabold tracking-tight">
          Ask the lectures
        </h2>
        <p className="mt-1 text-sm text-muted">Every answer cites the moment it comes from. Click a citation to jump there.</p>
      </header>

      <ol
        ref={listRef}
        aria-live="polite"
        className="min-h-24 flex-1 space-y-6 overflow-y-auto px-6 py-5 max-xl:max-h-[60dvh] motion-safe:scroll-smooth"
      >
        {entries.map((entry, i) => (
          <li key={i}>
            <p className="ml-auto w-fit max-w-[85%] rounded-3xl rounded-br-lg bg-lavender px-4 py-2.5 text-sm font-semibold">
              {entry.question}
            </p>
            <div className="mt-3 text-[15px] leading-relaxed">
              <ReplyView reply={entry.reply} lectureId={lectureId} onSeek={onSeek} />
            </div>
          </li>
        ))}
      </ol>

      <form onSubmit={ask} className="flex gap-2 border-t border-line p-4">
        <label htmlFor="question" className="sr-only">
          Your question
        </label>
        <input
          id="question"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={MAX_QUESTION_CHARS}
          required
          autoComplete="off"
          placeholder="Ask about this course…"
          className="min-w-0 flex-1 rounded-full bg-canvas px-5 py-3 text-sm placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={waiting}
          className="rounded-full bg-lime px-6 py-3 text-sm font-bold transition-colors hover:bg-ink hover:text-lime disabled:cursor-not-allowed disabled:opacity-50"
        >
          Ask
        </button>
      </form>
    </section>
  );
}
