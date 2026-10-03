import { expect, test } from "vitest";
import { citationText, parseCitations, splitByCitations, validateCitations } from "./citations";

const SEGMENTS = [
  { id: "seg-a", lecture_id: "lec-4", lecture_number: 4, start_s: 0, end_s: 64.76 },
  { id: "seg-b", lecture_id: "lec-4", lecture_number: 4, start_s: 65.1, end_s: 109.04 },
  { id: "seg-c", lecture_id: "lec-5", lecture_number: 5, start_s: 3600, end_s: 3680 },
];

test("parses the canonical form and the variants models tend to write", () => {
  const answer = "A [L4 · 23:34] B [L12 - 1:02:03] C [L4, 00:05] D [L4 83:10]";
  expect(parseCitations(answer)).toEqual([
    { raw: "[L4 · 23:34]", lectureNumber: 4, seconds: 1414 },
    { raw: "[L12 - 1:02:03]", lectureNumber: 12, seconds: 3723 },
    { raw: "[L4, 00:05]", lectureNumber: 4, seconds: 5 },
    { raw: "[L4 83:10]", lectureNumber: 4, seconds: 4990 }, // minutes counted past 59
  ]);
});

test("splits an answer into text and citations in reading order", () => {
  expect(splitByCitations("Chains hold collisions [L4 · 00:41]. Done.")).toEqual([
    "Chains hold collisions ",
    { raw: "[L4 · 00:41]", lectureNumber: 4, seconds: 41 },
    ". Done.",
  ]);
});

test("accepts citations that fall inside a retrieved segment of the same lecture", () => {
  const check = validateCitations("One [L4 · 00:30]. Two [L5 · 1:00:10].", SEGMENTS);
  expect(check).toEqual({
    ok: true,
    citations: [
      { raw: "[L4 · 00:30]", lectureNumber: 4, seconds: 30, segmentId: "seg-a", lectureId: "lec-4" },
      { raw: "[L5 · 1:00:10]", lectureNumber: 5, seconds: 3610, segmentId: "seg-c", lectureId: "lec-5" },
    ],
  });
});

test("accepts the exact label the model was shown, even when the segment starts mid-second", () => {
  const label = `[${citationText(4, 65.1)}]`; // "[L4 · 01:05]" = 65 s, just before the 65.1 s start
  expect(validateCitations(`Load factor is n/m ${label}.`, SEGMENTS)).toMatchObject({
    ok: true,
    citations: [{ segmentId: "seg-b" }],
  });
});

test.each([
  ["no citations at all", "Chaining uses linked lists."],
  ["a lecture that was not retrieved", "Chaining [L9 · 00:30]."],
  ["a time outside every retrieved segment", "Chaining [L4 · 05:00]."],
  ["right time, wrong lecture", "Chaining [L5 · 00:30]."],
  ["two citations crammed into one bracket", "Chaining [L4 · 00:30, L4 · 01:10]."],
  ["one good citation next to a malformed one", "Chaining [L4 · 00:30] and [L4 · 00:30-01:10]."],
])("rejects an answer with %s", (_case, answer) => {
  expect(validateCitations(answer, SEGMENTS).ok).toBe(false);
});
