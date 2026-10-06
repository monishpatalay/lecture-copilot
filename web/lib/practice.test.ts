import { expect, test } from "vitest";
import { cleanPractice, pickSegments, readPractice } from "./practice";

test("pickSegments spreads its picks across the whole list", () => {
  const numbers = Array.from({ length: 40 }, (_, i) => i);
  expect(pickSegments(numbers, 4)).toEqual([5, 15, 25, 35]);
  expect(pickSegments([1, 2, 3], 8)).toEqual([1, 2, 3]);
});

const SEGMENTS = [
  { start_s: 12.7, transcript: "a" },
  { start_s: 300.2, transcript: "b" },
];
// The correct option's slot is the sum of the question's character codes mod 4: "Q?" → 0, "Why hash?" → 3.
const item = (fields: object) => ({ segment: 1, question: "Q?", options: ["right", "w1", "w2", "w3"], answer: 0, explanation: "Because.", ...fields });

test("cleanPractice keeps valid items in lecture order and moves the correct option off the first slot", () => {
  const reply = `Here you go:\n\`\`\`json\n${JSON.stringify([
    item({ segment: 2, question: " Why hash? " }),
    item({ segment: 1, answer: 2, options: ["w1", "w2", "right", "w3"] }),
    item({ segment: 1, question: "Duplicate segment" }),
    item({ segment: 9 }),
    item({ segment: 2, options: ["only", "three", "options"] }),
    item({ segment: 2, options: ["same", "same", "x", "y"] }),
    item({ segment: 2, answer: 4 }),
    "junk",
  ])}\n\`\`\``;

  expect(cleanPractice(reply, SEGMENTS)).toEqual([
    { question: "Q?", options: ["right", "w2", "w1", "w3"], correct: 0, explanation: "Because.", t_s: 12 },
    { question: "Why hash?", options: ["w3", "w1", "w2", "right"], correct: 3, explanation: "Because.", t_s: 300 },
  ]);
});

test("cleanPractice returns nothing for a reply that is not JSON", () => {
  expect(cleanPractice("I cannot do that.", SEGMENTS)).toEqual([]);
});

test("readPractice accepts a stored set and rejects the old question-and-answer format", () => {
  const stored = cleanPractice(JSON.stringify([item({})]), SEGMENTS);
  expect(readPractice(stored)).toEqual(stored);
  expect(readPractice([{ question: "Q?", answer: "A.", t_s: 12 }])).toEqual([]);
  expect(readPractice(null)).toEqual([]);
});
