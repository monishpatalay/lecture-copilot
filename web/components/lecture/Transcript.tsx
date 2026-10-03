"use client";

import { useEffect, useRef } from "react";
import { formatTimestamp } from "@/lib/time";

export type TranscriptLine = { start: number; end: number; text: string };

export function Transcript({
  lines,
  activeIndex,
  onSeek,
}: {
  lines: TranscriptLine[];
  activeIndex: number;
  onSeek: (seconds: number) => void;
}) {
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    const item = list?.children[activeIndex] as HTMLElement | undefined;
    // Don't fight a reader who is hovering the list to read ahead.
    if (!list || !item || list.matches(":hover")) return;
    // Scroll the list itself. scrollIntoView would drag the whole page along with it.
    list.scrollTo({ top: item.offsetTop - (list.clientHeight - item.offsetHeight) / 2 });
  }, [activeIndex]);

  return (
    // `relative` makes the list the offsetParent, so item.offsetTop is measured inside it.
    <ol ref={listRef} className="relative max-h-[28rem] overflow-y-auto pr-2 motion-safe:scroll-smooth">
      {lines.map((line, i) => {
        const active = i === activeIndex;
        return (
          <li key={i}>
            <button
              type="button"
              onClick={() => onSeek(line.start)}
              aria-current={active || undefined}
              className={`flex w-full gap-4 rounded-2xl px-3 py-2 text-left leading-relaxed transition-colors ${
                active ? "bg-lime font-semibold" : "text-ink/70 hover:bg-canvas hover:text-ink"
              }`}
            >
              <span className={`w-12 shrink-0 pt-0.5 text-xs tabular-nums ${active ? "" : "text-muted"}`}>
                {formatTimestamp(line.start)}
              </span>
              {line.text}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
