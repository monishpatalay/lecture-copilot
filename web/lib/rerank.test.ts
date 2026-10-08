import { beforeEach, expect, test, vi } from "vitest";

vi.mock("./llm", () => ({ completeQuick: vi.fn() }));

import { completeQuick } from "./llm";
import { parseRanking, rerank } from "./rerank";

const llm = vi.mocked(completeQuick);
vi.spyOn(console, "warn").mockImplementation(() => {});
beforeEach(() => llm.mockReset());

const segments = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, transcript: `passage ${i + 1}` }));
const ids = (list: { id: number }[]) => list.map((s) => s.id);

test("parseRanking reads the list, dropping repeats and numbers out of range", () => {
  expect(parseRanking("Here: [3, 1, 3, 99, 0, 7]", 12)).toEqual([2, 0, 6]);
  expect(parseRanking("I could not decide.", 12)).toBeNull();
});

test("rerank keeps the six the model picked, in its order, and shows it every passage", async () => {
  llm.mockResolvedValueOnce("[9, 2, 12, 1, 5, 7]");
  expect(ids(await rerank("q", segments))).toEqual([9, 2, 12, 1, 5, 7]);
  expect(llm.mock.calls[0][0][0].content).toContain("[12] passage 12");
});

test("a short pick is topped up from the search order", async () => {
  llm.mockResolvedValueOnce("[9, 2]");
  expect(ids(await rerank("q", segments))).toEqual([9, 2, 1, 3, 4, 5]);
});

test("search order is kept when the model fails or says nothing usable", async () => {
  llm.mockRejectedValueOnce(new Error("timeout"));
  expect(ids(await rerank("q", segments))).toEqual([1, 2, 3, 4, 5, 6]);
  llm.mockResolvedValueOnce("no idea");
  expect(ids(await rerank("q", segments))).toEqual([1, 2, 3, 4, 5, 6]);
  expect(ids(await rerank("q", segments.slice(0, 4)))).toEqual([1, 2, 3, 4]); // nothing to choose between
  expect(llm).toHaveBeenCalledTimes(2);
});
