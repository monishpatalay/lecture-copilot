import OpenAI from "openai";

export type Message = { role: "system" | "user" | "assistant"; content: string };

/** For showing a reply as it is written. `onRestart` means: discard what was sent so far, a new reply follows. */
export type StreamHandlers = { onDelta: (text: string) => void; onRestart: () => void };

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

// For small helper calls on the way to an answer (reranking search results): one try, and a short wait,
// because the caller has a fine fallback and the person asking is waiting.
// A different model from the answer fallback on purpose: Gemini's free tier counts requests per model per day
// (500 for a lite model), and a rerank on every question would otherwise use up the fallback's allowance.
const QUICK_MODEL = "gemini-3.1-flash-lite";
const QUICK_TIMEOUT_MS = 3000;
const quickGemini = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  maxRetries: 0,
  timeout: QUICK_TIMEOUT_MS,
});

async function chat(
  client: OpenAI,
  model: string,
  messages: Message[],
  onDelta?: (text: string) => void,
  reason = true,
): Promise<string> {
  // Both models reason before answering; "low" keeps answers fast and inside Groq's free token budget.
  // Without the setting the light Gemini model doesn't reason at all: about 0.8 s for a rerank instead of 2.4 s.
  const request = { model, messages, ...(reason ? { reasoning_effort: "low" as const } : {}) };
  let text: string | null | undefined = "";
  if (onDelta) {
    for await (const chunk of await client.chat.completions.create({ ...request, stream: true })) {
      const piece = chunk.choices[0]?.delta?.content;
      if (!piece) continue;
      text += piece;
      onDelta(piece);
    }
  } else {
    text = (await client.chat.completions.create(request)).choices[0]?.message.content;
  }
  if (!text) throw new Error(`${model} returned an empty reply`);
  return text;
}

/** Rate limits, server errors and network failures are worth retrying on the other provider. */
function shouldFallBack(error: unknown): boolean {
  if (!(error instanceof OpenAI.APIError)) return false;
  return error.status === undefined || error.status === 429 || error.status >= 500;
}

/** One fast call to a light Gemini model. Throws when it is slow, busy or out of quota; it never touches Groq's answer budget. */
export async function completeQuick(messages: Message[]): Promise<string> {
  return chat(quickGemini, QUICK_MODEL, messages, undefined, false);
}

/** Asks Groq, and falls back to Gemini when Groq is rate-limited or down. With `stream`, the reply is also sent piece by piece. */
export async function complete(messages: Message[], stream?: StreamHandlers): Promise<{ text: string; model: string }> {
  let sentAnything = false;
  const onDelta = stream && ((piece: string) => ((sentAnything = true), stream.onDelta(piece)));
  try {
    return { text: await chat(groq, GROQ_MODEL, messages, onDelta), model: GROQ_MODEL };
  } catch (error) {
    if (!shouldFallBack(error)) throw error;
    console.warn(`Groq failed (${error instanceof Error ? error.message : error}); falling back to Gemini`);
    if (sentAnything) stream!.onRestart(); // Groq broke off mid-reply
    return { text: await chat(gemini, GEMINI_MODEL, messages, stream?.onDelta), model: GEMINI_MODEL };
  }
}
