import { beforeEach, expect, test, vi } from "vitest";
import type { Segment } from "./citations";

vi.mock("./llm", () => ({ complete: vi.fn() }));

import { generateAnswer } from "./answer";
import { complete } from "./llm";

const llm = vi.mocked(complete);
const reply = (text: string) => ({ text, model: "test-model" });

const SEGMENT: Segment = {
  id: "seg-a",
  lecture_id: "lec-4",
  lecture_number: 4,
  start_s: 65.1,
  end_s: 109.04,
  transcript: "The load factor alpha is n divided by m.",
  slide_text: "alpha = n / m",
  score: 0.03,
  similarity: 0.9,
};

beforeEach(() => llm.mockReset());

test("answers with validated citations and shows the model each segment's label", async () => {
  llm.mockResolvedValueOnce(reply("Alpha is n/m [L4 · 01:05]."));

  const answer = await generateAnswer("What is the load factor?", [SEGMENT]);

  expect(answer).toMatchObject({ status: "answered", text: "Alpha is n/m [L4 · 01:05].", citations: [{ segmentId: "seg-a" }] });
  const prompt = llm.mock.calls[0][0][1].content;
  expect(prompt).toContain("[L4 · 01:05]\nTranscript: The load factor alpha is n divided by m.\nSlide: alpha = n / m");
});

test("does not call the LLM when nothing relevant was retrieved", async () => {
  expect(await generateAnswer("How do I bake bread?", [{ ...SEGMENT, similarity: 0.7 }])).toEqual({ status: "not_covered", model: null });
  expect(await generateAnswer("How do I bake bread?", [])).toEqual({ status: "not_covered", model: null });
  expect(llm).not.toHaveBeenCalled();
});

test("reports not covered when the model says the segments don't answer the question", async () => {
  llm.mockResolvedValueOnce(reply("NOT_COVERED"));
  expect(await generateAnswer("What is quicksort?", [SEGMENT])).toEqual({ status: "not_covered", model: "test-model" });
});

test("regenerates once when a citation doesn't match a retrieved segment, saying what was wrong", async () => {
  llm.mockResolvedValueOnce(reply("Alpha is n/m [L9 · 12:00].")).mockResolvedValueOnce(reply("Alpha is n/m [L4 · 01:05]."));

  const answer = await generateAnswer("What is the load factor?", [SEGMENT]);

  expect(answer.status).toBe("answered");
  expect(llm).toHaveBeenCalledTimes(2);
  expect(llm.mock.calls[1][0].at(-1)?.content).toContain("[L9 · 12:00] is not one of the provided segments.");
});

test("gives up after the second invalid answer instead of returning unverified citations", async () => {
  llm.mockResolvedValue(reply("Alpha is n/m, trust me."));

  expect(await generateAnswer("What is the load factor?", [SEGMENT])).toEqual({ status: "unverifiable", model: "test-model" });
  expect(llm).toHaveBeenCalledTimes(2);
});
