import { expect, test } from "vitest";
import { cleanPractice, pickSegments } from "./practice";

test("pickSegments spreads its picks across the whole list", () => {
  const numbers = Array.from({ length: 40 }, (_, i) => i);
  expect(pickSegments(numbers, 4)).toEqual([5, 15, 25, 35]);
  expect(pickSegments([1, 2, 3], 8)).toEqual([1, 2, 3]);
});

test("cleanPractice keeps valid items, in lecture order, and drops the rest", () => {
  const segments = [
    { start_s: 12.7, transcript: "a" },
    { start_s: 300.2, transcript: "b" },
  ];
  const reply = `Here you go:
\`\`\`json
[
  {"segment": 2, "question": "Why hash?", "answer": "Constant time lookups."},
  {"segment": 1, "question": " What is a set? ", "answer": "A collection of keys."},
  {"segment": 1, "question": "Duplicate segment", "answer": "Dropped."},
  {"segment": 9, "question": "Unknown segment", "answer": "Dropped."},
  {"segment": 2, "question": "", "answer": "No question."},
  "junk"
]
\`\`\``;
  expect(cleanPractice(reply, segments)).toEqual([
    { question: "What is a set?", answer: "A collection of keys.", t_s: 12 },
    { question: "Why hash?", answer: "Constant time lookups.", t_s: 300 },
  ]);
});

test("cleanPractice returns nothing for a reply that is not JSON", () => {
  expect(cleanPractice("I cannot do that.", [{ start_s: 0, transcript: "a" }])).toEqual([]);
});
