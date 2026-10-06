import { expect, test } from "vitest";
import { summarizeQuestions, type QuestionRow } from "./insights";

const row = (fields: Partial<QuestionRow>): QuestionRow => ({
  text: "q",
  covered: true,
  cited_segment_ids: [],
  latency_ms: 1000,
  user_hash: "a",
  created_at: "2026-10-05T10:00:00Z",
  ...fields,
});

test("summarizes questions into counts, gaps, cited segments and lectures", () => {
  const lectureOfSegment = new Map([
    ["s1", "L3"],
    ["s2", "L3"],
    ["s3", "L4"],
  ]);
  const summary = summarizeQuestions(
    [
      row({ cited_segment_ids: ["s1", "s2"], latency_ms: 700 }),
      row({ cited_segment_ids: ["s1", "s3"], latency_ms: 900, user_hash: "b" }),
      row({ covered: false, text: "What is a B-tree?", latency_ms: 300 }),
      row({ covered: false, text: " what is a b-tree? ", latency_ms: null }),
      row({ covered: null, latency_ms: 5000 }),
    ],
    lectureOfSegment,
  );

  expect(summary).toMatchObject({ total: 5, askers: 2, answered: 2, notCovered: 2, medianLatencyMs: 700 });
  expect(summary.gaps).toEqual([{ text: "What is a B-tree?", created_at: "2026-10-05T10:00:00Z" }]);
  expect(summary.topSegments[0]).toEqual({ segmentId: "s1", count: 2 });
  // The first answer cites two segments of L3 but counts once for that lecture.
  expect([...summary.perLecture]).toEqual([
    ["L3", 2],
    ["L4", 1],
  ]);
});

test("an empty log has no median", () => {
  expect(summarizeQuestions([], new Map()).medianLatencyMs).toBeNull();
});
