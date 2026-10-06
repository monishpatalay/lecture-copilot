"use client";

import Link from "next/link";
import { useState } from "react";
import { citationText } from "@/lib/citations";
import type { PracticeItem } from "@/lib/practice";
import { CHIP } from "@/lib/ui";

const LETTERS = ["A", "B", "C", "D"];

export function Quiz({ items, lectureId, lectureNumber }: { items: PracticeItem[]; lectureId: string; lectureNumber: number }) {
  const [chosen, setChosen] = useState<Record<number, number>>({}); // question index → option picked
  const answered = Object.keys(chosen).length;
  const right = items.filter((item, i) => chosen[i] === item.correct).length;

  return (
    <div className="mt-8 max-w-3xl">
      <div aria-live="polite" className="sticky top-3 z-10 flex items-center justify-between gap-4 rounded-full bg-ink px-6 py-3 text-white shadow-card">
        <p className="text-sm font-semibold">
          <span className="text-2xl font-extrabold text-lime tabular-nums">
            {right}/{items.length}
          </span>{" "}
          correct · {answered} of {items.length} answered
        </p>
        {answered > 0 && (
          <button type="button" onClick={() => setChosen({})} className="rounded-full px-4 py-1.5 text-sm font-bold hover:bg-white/15">
            Start over
          </button>
        )}
      </div>

      <ol className="mt-4 grid gap-4">
        {items.map((item, i) => {
          const picked = chosen[i];
          const done = picked !== undefined;
          return (
            <li key={item.t_s} className="flex gap-5 rounded-card bg-card p-7 shadow-card">
              <span className="w-10 shrink-0 text-4xl leading-none font-extrabold text-ink/25 tabular-nums">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-lg leading-snug font-bold">{item.question}</p>
                <ul className="mt-4 grid gap-2">
                  {item.options.map((option, o) => {
                    const state = !done ? "open" : o === item.correct ? "correct" : o === picked ? "wrong" : "other";
                    return (
                      <li key={o}>
                        <button
                          type="button"
                          disabled={done}
                          onClick={() => setChosen((prev) => ({ ...prev, [i]: o }))}
                          className={`flex w-full items-baseline gap-3 rounded-2xl px-4 py-3 text-left text-[15px] transition-colors ${
                            {
                              open: "bg-canvas hover:bg-lavender",
                              correct: "bg-lime font-bold",
                              wrong: "bg-red-100 text-red-950 line-through decoration-red-900/40",
                              other: "bg-canvas text-muted",
                            }[state]
                          }`}
                        >
                          <span className="font-extrabold">{LETTERS[o]}</span>
                          <span>
                            {option}
                            {state === "correct" && <span className="sr-only"> (correct answer)</span>}
                            {state === "wrong" && <span className="sr-only"> (your answer, incorrect)</span>}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {done && (
                  <p className="mt-4 leading-relaxed">
                    <span className="font-bold">{picked === item.correct ? "Correct. " : "Not quite. "}</span>
                    {item.explanation}{" "}
                    <Link href={`/lectures/${lectureId}?t=${item.t_s}`} className={CHIP}>
                      {citationText(lectureNumber, item.t_s)} ↗
                    </Link>
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
