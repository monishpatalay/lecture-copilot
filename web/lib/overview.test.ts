import { expect, test } from "vitest";
import { validateCitations } from "./citations";
import { outlineSegments, outlineText, type OutlineLecture } from "./overview";

const LECTURES: OutlineLecture[] = [
  { id: "a", number: 3, title: "Sets and Sorting", duration_s: 3060, chapters: [{ t_s: 0, title: "The set interface" }, { t_s: 1585, title: "Selection sort" }] },
  { id: "b", number: 4, title: "Hashing", duration_s: null, chapters: "not a list" },
];

test("the outline lists the course, each lecture and each chapter with a label the model can copy", () => {
  const text = outlineText("Intro to Algorithms", LECTURES);

  expect(text).toContain("Course: Intro to Algorithms\nNumber of lectures: 2");
  expect(text).toContain("[L3 · 00:00] Lecture 3: Sets and Sorting, 51:00 long");
  expect(text).toContain("[L3 · 26:25] Selection sort");
  expect(text).toContain("[L4 · 00:00] Lecture 4: Hashing"); // no length and no chapters: still listed
});

test("an outline answer may cite any time inside a real lecture, and nothing else", () => {
  const segments = outlineSegments(LECTURES);

  expect(validateCitations("Selection sort is in lecture 3 [L3 · 26:25].", segments)).toMatchObject({
    ok: true,
    citations: [{ lectureId: "a", seconds: 1585 }],
  });
  expect(validateCitations("It runs past the end [L3 · 59:00].", segments).ok).toBe(false);
  expect(validateCitations("There is a lecture 9 [L9 · 0:00].", segments).ok).toBe(false);
});
