import { expect, test, vi } from "vitest";

vi.mock("./llm", () => ({ complete: vi.fn() }));

import { cleanHistory, standaloneQuestion } from "./followup";
import { complete } from "./llm";

const llm = vi.mocked(complete);
vi.spyOn(console, "warn").mockImplementation(() => {});

test("cleanHistory keeps the last three well-formed turns and trims long answers", () => {
  const turn = (n: number) => ({ question: `q${n}`, answer: `a${n}` });
  expect(cleanHistory([turn(1), turn(2), { question: "no answer" }, "junk", turn(3), turn(4)])).toEqual([turn(2), turn(3), turn(4)]);
  expect(cleanHistory([{ question: " q ", answer: "x".repeat(900) }])[0]).toEqual({ question: "q", answer: "x".repeat(700) });
  expect(cleanHistory("nope")).toEqual([]);
});

test("standaloneQuestion uses the rewrite, and the typed message when the rewrite fails", async () => {
  const history = [{ question: "What is chaining?", answer: "Each slot holds a list." }];
  llm.mockResolvedValueOnce({ text: "Can you explain hashing with chaining more simply?\n", model: "m" });
  expect(await standaloneQuestion(history, "explain that more simply")).toBe("Can you explain hashing with chaining more simply?");
  expect(llm.mock.calls[0][0][1].content).toContain("Student: What is chaining?\nAnswer: Each slot holds a list.");

  llm.mockRejectedValueOnce(new Error("rate limited"));
  expect(await standaloneQuestion(history, "why?")).toBe("why?");
});
