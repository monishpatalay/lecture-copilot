import OpenAI from "openai";
import { beforeEach, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.GROQ_API_KEY = "test-key";
  process.env.GEMINI_API_KEY = "test-key";
});

import { complete } from "./llm";

// Both clients share this method, so one stub sees the Groq call and then the Gemini call.
const create = vi.spyOn(Object.getPrototypeOf(new OpenAI({ apiKey: "x" }).chat.completions), "create");
vi.spyOn(console, "warn").mockImplementation(() => {});

const reply = (content: string) => ({ choices: [{ message: { content } }] });
const MESSAGES = [{ role: "user" as const, content: "hi" }];

beforeEach(() => {
  // Any call a test didn't queue a reply for fails loudly instead of reaching the network.
  create.mockReset().mockRejectedValue(new Error("unexpected LLM call"));
});

test.each([
  ["a rate limit", new OpenAI.APIError(429, undefined, "rate limited", new Headers())],
  ["a server error", new OpenAI.APIError(503, undefined, "unavailable", new Headers())],
  ["a network failure", new OpenAI.APIConnectionError({ message: "socket hang up" })],
])("falls back to Gemini on %s", async (_case, error) => {
  create.mockRejectedValueOnce(error).mockResolvedValueOnce(reply("from gemini"));

  await expect(complete(MESSAGES)).resolves.toEqual({ text: "from gemini", model: "gemini-3.8-flash" });
  expect(create.mock.calls.map(([body]) => (body as { model: string }).model)).toEqual([
    "openai/gpt-oss-120b",
    "gemini-3.8-flash",
  ]);
});

test("does not fall back when the request itself is wrong (e.g. a bad API key)", async () => {
  create.mockRejectedValueOnce(new OpenAI.APIError(401, undefined, "bad key", new Headers()));

  await expect(complete(MESSAGES)).rejects.toThrow("bad key");
  expect(create).toHaveBeenCalledTimes(1);
});
