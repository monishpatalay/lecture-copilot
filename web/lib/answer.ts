import { citationText, validateCitations, type ResolvedCitation, type Segment } from "./citations";
import { complete, type Message, type StreamHandlers } from "./llm";

export type Answer =
  | { status: "answered"; text: string; citations: ResolvedCitation[]; model: string }
  | { status: "not_covered"; model: string | null } // model is null when the LLM was never called
  | { status: "unverifiable"; model: string }; // citations failed validation twice

// Below this, nothing relevant was retrieved and the LLM isn't called at all.
// Tuned on evals/questions.jsonl: the weakest of 120 covered questions scores 0.801, so 0.78 never blocks
// one and still turns away about a third of the uncovered ones. The model refuses the rest.
const MIN_SIMILARITY = 0.78;

const SYSTEM_PROMPT = `You answer students' questions about a course using only the lecture segments you are given.

Rules:
- Use only what the segments say. Do not add facts, definitions or reasoning steps from your own knowledge, even when they are true. If the segments support only part of an answer, give only that part.
- End every sentence with the label of the segment that supports it, copied exactly, for example: Colliding keys are kept in a list [L4 · 23:34]. Write one label per bracket. Never collect the citations at the end of the answer.
- If you cannot cite a sentence, leave it out.
- If the segments do not answer the question, reply with exactly NOT_COVERED and nothing else.
- Answer in plain text of at most 150 words. No markdown and no LaTeX: write formulas as plain text, like 1 + (n - 1)/m or O(n log n).`;

const OUTLINE_PROMPT = `You answer students' questions about a course itself, using only the course outline you are given: its title, its lectures and their chapters.

Rules:
- Answer only questions about the course: what it is about, how many lectures it has, how long they are, what a lecture covers, or which lecture or chapter covers a topic.
- If the question asks you to explain, define or work through a topic, or is about anything else, reply with exactly NOT_COVERED and nothing else. Never explain a topic yourself: the outline only says where it is taught.
- Use only what the outline says. Do not add facts from your own knowledge.
- When you say what a lecture or chapter covers, end that sentence with the label at the start of its line, copied exactly, for example: Lecture 4 is about hashing [L4 · 00:00]. Write one label per bracket. The answer must contain at least one label.
- If the outline does not answer the question, reply with exactly NOT_COVERED and nothing else.
- Answer in plain text of at most 120 words. No markdown.`;

const NOT_COVERED = "NOT_COVERED";

/** Holds back the start of a streamed reply until it is clear it isn't the NOT_COVERED sentinel, which readers never see. */
function withoutSentinel(onDelta: (text: string) => void): (piece: string) => void {
  let held = "";
  let open = false;
  return (piece) => {
    if (open) return onDelta(piece);
    held += piece;
    const start = held.trimStart();
    const couldBeSentinel = start.length < NOT_COVERED.length ? NOT_COVERED.startsWith(start) : start.startsWith(NOT_COVERED);
    if (couldBeSentinel) return;
    open = true;
    onDelta(held);
  };
}

/** False when search found nothing close enough to the question to be worth a model call. */
export function isRelevant(segments: Segment[]): boolean {
  return Math.max(...segments.map((s) => s.similarity)) >= MIN_SIMILARITY;
}

function buildPrompt(question: string, segments: Segment[]): string {
  const blocks = segments.map((s) => {
    const lines = [`[${citationText(s.lecture_number, s.start_s)}]`, `Transcript: ${s.transcript}`];
    if (s.slide_text) lines.push(`Slide: ${s.slide_text}`);
    return lines.join("\n");
  });
  return `Lecture segments:\n\n${blocks.join("\n\n")}\n\nQuestion: ${question}`;
}

function judge(reply: { text: string; model: string }, segments: Segment[]): Answer | { status: "invalid"; problem: string } {
  if (reply.text.includes(NOT_COVERED)) return { status: "not_covered", model: reply.model };
  const check = validateCitations(reply.text, segments);
  if (!check.ok) return { status: "invalid", problem: check.problem };
  return { status: "answered", text: reply.text.trim(), citations: check.citations, model: reply.model };
}

/**
 * Writes an answer from the retrieved segments. Citations are checked in code, with one retry.
 * With `stream`, the text is sent as it is written; the returned Answer is still the only verified result.
 */
export async function generateAnswer(question: string, segments: Segment[], stream?: StreamHandlers): Promise<Answer> {
  if (!isRelevant(segments)) return { status: "not_covered", model: null };
  return writeChecked(SYSTEM_PROMPT, buildPrompt(question, segments), segments, stream);
}

/**
 * A second try for a question the lectures' words don't answer: questions about the course itself (how many
 * lectures, what a lecture covers, where a topic is taught), answered from the outline of titles and chapters.
 * `segments` are `outlineSegments(...)`, so citations are checked the same way.
 */
export async function generateOutlineAnswer(question: string, outline: string, segments: Segment[], stream?: StreamHandlers): Promise<Answer> {
  return writeChecked(OUTLINE_PROMPT, `Course outline:\n\n${outline}\n\nQuestion: ${question}`, segments, stream);
}

async function writeChecked(system: string, prompt: string, segments: Segment[], stream?: StreamHandlers): Promise<Answer> {
  const attempt = (messages: Message[]) =>
    complete(messages, stream && { onDelta: withoutSentinel(stream.onDelta), onRestart: stream.onRestart });

  const messages: Message[] = [
    { role: "system", content: system },
    { role: "user", content: prompt },
  ];
  const first = await attempt(messages);
  const verdict = judge(first, segments);
  if (verdict.status !== "invalid") return verdict;
  console.warn(`Answer rejected (${verdict.problem}) Regenerating. It was:\n${first.text}`);

  // Regenerate once, telling the model what was wrong with its citations.
  stream?.onRestart();
  const second = await attempt([
    ...messages,
    { role: "assistant", content: first.text },
    { role: "user", content: `${verdict.problem} Rewrite the answer, citing only the labels of the segments above.` },
  ]);
  const retry = judge(second, segments);
  if (retry.status !== "invalid") return retry;
  console.warn(`Regenerated answer rejected too (${retry.problem}) It was:\n${second.text}`);
  return { status: "unverifiable", model: second.model };
}
