import { MAX_TURNS } from "./ask-contract";
import { complete } from "./llm";

/** One earlier exchange, sent back by the Ask panel so a follow-up like "why?" can be understood. */
export type Turn = { question: string; answer: string };

const MAX_TURN_QUESTION_CHARS = 500;
const MAX_TURN_ANSWER_CHARS = 700; // enough to know what was said; keeps the rewrite small
const MAX_STANDALONE_CHARS = 500;

/** The last few well-formed turns of whatever the browser sent. Anything else is dropped. */
export function cleanHistory(raw: unknown): Turn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .flatMap((turn) =>
      turn && typeof turn.question === "string" && typeof turn.answer === "string" && turn.question.trim() && turn.answer.trim()
        ? [{ question: turn.question.trim().slice(0, MAX_TURN_QUESTION_CHARS), answer: turn.answer.trim().slice(0, MAX_TURN_ANSWER_CHARS) }]
        : [],
    )
    .slice(-MAX_TURNS);
}

const SYSTEM_PROMPT = `You turn a student's follow-up message into one standalone question about a lecture course.

Rules:
- The standalone question must make sense without the conversation: replace "it", "that", "this" and the like with what they refer to.
- Keep what the student is asking for, including requests such as a simpler explanation, an example or more detail.
- If the message is already a standalone question, return it unchanged.
- Reply with the question only.`;

/**
 * "Can you explain that more simply?" finds nothing in a search. This rewrites a follow-up using the
 * conversation so retrieval and the answer both work from a complete question. Falls back to the message
 * as typed when the rewrite fails or comes back unusable.
 */
export async function standaloneQuestion(history: Turn[], question: string): Promise<string> {
  const conversation = history.map((turn) => `Student: ${turn.question}\nAnswer: ${turn.answer}`).join("\n\n");
  try {
    const reply = await complete([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Conversation so far:\n\n${conversation}\n\nFollow-up message: ${question}` },
    ]);
    const rewritten = reply.text.trim().split("\n")[0].trim();
    return rewritten && rewritten.length <= MAX_STANDALONE_CHARS ? rewritten : question;
  } catch (error) {
    console.warn("follow-up rewrite failed; searching with the message as typed:", error);
    return question;
  }
}
