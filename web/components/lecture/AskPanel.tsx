"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { MAX_QUESTION_CHARS, MAX_TURNS, type AskData, type AskResponse, type AskStreamEvent } from "@/lib/ask-contract";
import { citationText, splitByCitations } from "@/lib/citations";
import { formatTimestamp } from "@/lib/time";
import { CHIP } from "@/lib/ui";

type Reply = ({ ok: true } & AskData) | { ok: false; error: string };
// reply is null while waiting; `partial` is the answer text received so far, not yet checked.
type Entry = { question: string; reply: Reply | null; partial: string };
type Turn = { question: string; answer: string };

const toReply = (body: AskResponse): Reply => (body.success ? { ok: true, ...body.data } : { ok: false, error: body.error });

/** Asks, calling `onPartial` with the answer text as it is written. Resolves with the checked reply. */
async function fetchReply(question: string, courseId: string, history: Turn[], onPartial: (text: string) => void): Promise<Reply> {
  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, courseId, history, stream: true }),
    });
    // Refusals (bad input, daily limit) come back as plain JSON before any stream starts.
    if (!res.body || !res.headers.get("content-type")?.includes("ndjson")) return toReply(await res.json());

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    let partial = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;
      for (let end = buffer.indexOf("\n"); end >= 0; end = buffer.indexOf("\n")) {
        const event: AskStreamEvent = JSON.parse(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
        if (event.type === "done") return toReply(event);
        partial = event.type === "delta" ? partial + event.text : "";
        onPartial(partial);
      }
    }
    return { ok: false, error: "The answer was cut off. Please try again." };
  } catch {
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

function ReplyView({
  reply,
  partial,
  lectureId,
  onSeek,
}: {
  reply: Reply | null;
  partial: string;
  lectureId?: string;
  onSeek?: (seconds: number) => void;
}) {
  if (!reply && !partial) return <p className="text-sm text-muted motion-safe:animate-pulse">Searching the lectures…</p>;
  if (!reply) {
    // Still being written, and not yet checked: citations are shown but can't be followed.
    return (
      <p className="whitespace-pre-wrap">
        {splitByCitations(partial).map((part, i) =>
          typeof part === "string" ? (
            part
          ) : (
            <span key={i} className="mx-0.5 inline-block rounded-full bg-canvas px-2.5 py-0.5 text-xs font-bold whitespace-nowrap text-muted tabular-nums">
              {citationText(part.lectureNumber, part.seconds)}
            </span>
          ),
        )}
      </p>
    );
  }
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

  // The server returns one checked citation per citation in the text, in reading order, each pointing at the
  // sentence it supports. Anything it didn't return stays plain text.
  let next = 0;
  const parts = splitByCitations(reply.answer).map((part) => (typeof part === "string" ? part : (reply.citations[next++] ?? part.raw)));
  const jump = (lectureIdOfSource: string, seconds: number, label: string) =>
    onSeek && lectureIdOfSource === lectureId ? (
      <button type="button" onClick={() => onSeek(seconds)} title="Jump to this moment" className={CHIP}>
        {label}
      </button>
    ) : (
      <Link href={`/lectures/${lectureIdOfSource}?t=${Math.floor(seconds)}`} className={CHIP}>
        {label} ↗
      </Link>
    );

  return (
    <>
    <p className="whitespace-pre-wrap">
      {parts.map((part, i) =>
        typeof part === "string" ? (
          part
        ) : (
          <span key={i}>{jump(part.lectureId, part.seconds, citationText(part.lectureNumber, part.seconds))}</span>
        ),
      )}
    </p>
    {reply.sources.length > 0 && (
      <section aria-label="Sources" className="mt-4 border-t border-line pt-3">
        <h3 className="text-xs font-bold tracking-widest text-muted uppercase">Sources</h3>
        <ol className="mt-2 grid gap-2.5">
          {reply.sources.map((source) => (
            <li key={source.segmentId} className="text-sm leading-snug text-ink/70">
              {jump(source.lectureId, source.startS, `${citationText(source.lectureNumber, source.startS)} – ${formatTimestamp(source.endS)}`)}{" "}
              {source.excerpt}
            </li>
          ))}
        </ol>
      </section>
    )}
    </>
  );
}

export function AskPanel({
  courseId,
  lectureId,
  onSeek,
  className = "",
}: {
  courseId: string;
  /** The lecture on screen and how to seek its player. Without them, every citation is a link to its lecture. */
  lectureId?: string;
  onSeek?: (seconds: number) => void;
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
    // Earlier answered exchanges go along, so "why?" or "explain that more simply" is understood.
    const history = entries
      .flatMap((entry) => (entry.reply?.ok && entry.reply.covered ? [{ question: entry.question, answer: entry.reply.answer }] : []))
      .slice(-MAX_TURNS);
    setEntries((prev) => [...prev, { question, reply: null, partial: "" }]);
    // One request at a time, so the waiting entry is always the last one.
    const updateLast = (change: Partial<Entry>) =>
      setEntries((prev) => prev.map((entry, i) => (i === prev.length - 1 ? { ...entry, ...change } : entry)));
    const reply = await fetchReply(question, courseId, history, (partial) => updateLast({ partial }));
    updateLast({ reply });
  }

  return (
    <section aria-labelledby="ask-heading" className={`flex flex-col rounded-card bg-card shadow-card ${className}`}>
      <header className="border-b border-line px-6 pt-6 pb-4">
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
              <ReplyView reply={entry.reply} partial={entry.partial} lectureId={lectureId} onSeek={onSeek} />
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
          placeholder={entries.length ? "Ask a follow-up…" : "Ask about this course…"}
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
