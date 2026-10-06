import { expect, test } from "vitest";
import type { ResolvedCitation } from "./citations";
import { bestMoment, refineCitations, type Line } from "./refine";

const LINES: Line[] = [
  { start: 100, end: 104, text: "Okay, so let's get going again." },
  { start: 104, end: 109, text: "Remember that a set stores keys." },
  { start: 109, end: 115, text: "Now, two different keys can map to the same index." },
  { start: 115, end: 120, text: "That is called a collision." },
  { start: 120, end: 127, text: "With chaining, each slot holds a linked list of the items that collided there." },
  { start: 127, end: 133, text: "So a lookup hashes the key and scans the list." },
];

test("bestMoment finds where the lecturer makes the point, not where the segment starts", () => {
  expect(bestMoment("Chaining stores collided items in a linked list at each slot", LINES)).toBe(120);
  expect(bestMoment("A collision is when two keys map to the same index", LINES)).toBe(109);
});

test("bestMoment gives up when the claim shares almost nothing with the lines", () => {
  expect(bestMoment("Bread needs yeast and flour", LINES)).toBeNull();
  expect(bestMoment("keys", LINES)).toBeNull();
});

test("refineCitations moves each citation to its own sentence and leaves unknown lectures alone", () => {
  const citation = (raw: string, lectureId: string): ResolvedCitation => ({
    raw,
    lectureNumber: 4,
    seconds: 100,
    segmentId: lectureId === "lec-4" ? "seg" : "other",
    lectureId,
  });
  const answer =
    "Two keys can map to the same index, a collision [L4 · 01:40]. Chaining keeps a linked list in each slot [L4 · 01:40]. Unrelated [L4 · 01:40].";
  const refined = refineCitations(
    answer,
    [citation("[L4 · 01:40]", "lec-4"), citation("[L4 · 01:40]", "lec-4"), citation("[L4 · 01:40]", "lec-9")],
    [
      { id: "seg", start_s: 100.4, end_s: 133 },
      { id: "other", start_s: 100, end_s: 133 },
    ],
    new Map([["lec-4", LINES]]),
  );
  expect(refined.map((c) => c.seconds)).toEqual([109, 120, 100]);
});
