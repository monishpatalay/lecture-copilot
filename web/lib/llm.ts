import OpenAI from "openai";

export type Message = { role: "system" | "user" | "assistant"; content: string };

const GROQ_MODEL = "openai/gpt-oss-120b";
// The larger Flash models are often overloaded on the free tier (503 "high demand"); the lite model
// answered the same prompt in about a second. A fallback has to be the dependable one.
const GEMINI_MODEL = "gemini-3.5-flash-lite";

// No SDK retries on Groq: a rate limit or outage should fall through to Gemini straight away.
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
  maxRetries: 0,
  timeout: 20_000,
});
const gemini = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  maxRetries: 1,
  timeout: 20_000,
});

async function chat(client: OpenAI, model: string, messages: Message[]): Promise<string> {
  // Both models reason before answering; "low" keeps answers fast and inside Groq's free token budget.
  const completion = await client.chat.completions.create({ model, messages, reasoning_effort: "low" });
  const text = completion.choices[0]?.message.content;
  if (!text) throw new Error(`${model} returned an empty reply`);
  return text;
}

/** Rate limits, server errors and network failures are worth retrying on the other provider. */
function shouldFallBack(error: unknown): boolean {
  if (!(error instanceof OpenAI.APIError)) return false;
  return error.status === undefined || error.status === 429 || error.status >= 500;
}

/** Asks Groq, and falls back to Gemini when Groq is rate-limited or down. */
export async function complete(messages: Message[]): Promise<{ text: string; model: string }> {
  try {
    return { text: await chat(groq, GROQ_MODEL, messages), model: GROQ_MODEL };
  } catch (error) {
    if (!shouldFallBack(error)) throw error;
    console.warn(`Groq failed (${error instanceof Error ? error.message : error}); falling back to Gemini`);
    return { text: await chat(gemini, GEMINI_MODEL, messages), model: GEMINI_MODEL };
  }
}
