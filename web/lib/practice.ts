import type { Message } from "./llm";

/** One multiple-choice practice question, as stored in lectures.practice. */
export type PracticeItem = { question: string; options: string[]; correct: number; explanation: string; t_s: number };
type SourceSegment = { start_s: number; transcript: string };

// One question per segment. Eight segments is about 2.5K tokens, well inside Groq's 8K tokens a minute.
const QUESTION_COUNT = 8;
const OPTION_COUNT = 4;
const MAX_QUESTION_CHARS = 300;
const MAX_OPTION_CHARS = 200;
const MAX_EXPLANATION_CHARS = 700;

/** Segments spread evenly across the lecture, so the questions cover all of it. */
export function pickSegments<T>(segments: T[], count = QUESTION_COUNT): T[] {
  if (segments.length <= count) return segments;
  return Array.from({ length: count }, (_, i) => segments[Math.floor(((i + 0.5) * segments.length) / count)]);
}

export function buildPracticeMessages(segments: SourceSegment[]): Message[] {
  const blocks = segments.map((s, i) => `Segment ${i + 1}:\n${s.transcript}`);
  return [
    {
      role: "system",
      content: `You write multiple-choice exam questions from lecture transcript segments.

Rules:
- Write one question per segment. It must test understanding of a concept the segment teaches: why something works, what follows from it, or how to apply it. Do not test recall of wording.
- Ask about the subject directly. Never mention "the lecture", "the lecturer", "the segment", "the transcript" or "according to".
- Give exactly four options. Exactly one is correct, and the segment must support it. The three wrong options must be plausible mistakes a student could make, similar in length and style to the correct one. No "all of the above" or "none of the above".
- "answer" is the position of the correct option, counting from 0.
- "explanation" says in one or two sentences why the correct option is right, using only what the segment says. State it as a fact about the subject; do not mention the segment.
- When the segment states a result (a running time, a formula, a definition), the correct option must state exactly that result, not a similar one.
- Write formulas as plain text, for example O(n log n), log_n(u), n^2. No LaTeX and no backslashes.
- Skip a segment that has nothing examinable (greetings, logistics, jokes).
- Reply with only a JSON array, no markdown: [{"segment": 1, "question": "...", "options": ["...", "...", "...", "..."], "answer": 0, "explanation": "..."}]`,
    },
    { role: "user", content: blocks.join("\n\n") },
  ];
}

const isText = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;

/**
 * Keeps the well-formed items of the model's reply that point at one of the given segments, one per segment.
 * Models put the correct option first far too often, so it is moved to a slot derived from the question's text:
 * the same on every run, with no pattern a student could learn.
 */
export function cleanPractice(reply: string, segments: SourceSegment[]): PracticeItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(reply.slice(reply.indexOf("["), reply.lastIndexOf("]") + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const bySegment = new Map<number, PracticeItem>();
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const { segment, question, options, answer, explanation } = item as Record<string, unknown>;
    if (typeof segment !== "number" || !Number.isInteger(segment) || !segments[segment - 1] || bySegment.has(segment)) continue;
    if (!isText(question, MAX_QUESTION_CHARS) || !isText(explanation, MAX_EXPLANATION_CHARS)) continue;
    if (!Array.isArray(options) || options.length !== OPTION_COUNT || !options.every((o) => isText(o, MAX_OPTION_CHARS))) continue;
    if (typeof answer !== "number" || !Number.isInteger(answer) || answer < 0 || answer >= OPTION_COUNT) continue;
    const texts = options.map((o) => o.trim());
    if (new Set(texts).size !== OPTION_COUNT) continue;

    const correct = [...question.trim()].reduce((sum, char) => sum + char.charCodeAt(0), 0) % OPTION_COUNT;
    [texts[correct], texts[answer]] = [texts[answer], texts[correct]];
    bySegment.set(segment, {
      question: question.trim(),
      options: texts,
      correct,
      explanation: explanation.trim(),
      t_s: Math.floor(segments[segment - 1].start_s),
    });
  }
  return [...bySegment.values()].sort((x, y) => x.t_s - y.t_s);
}

/**
 * A second look at a generated set: the model answers each question from its segment without being told
 * which option was marked correct. See keepVerified.
 */
export function buildVerifyMessages(segments: SourceSegment[], items: PracticeItem[]): Message[] {
  const blocks = items.map((item, i) => {
    const segment = segments.find((s) => Math.floor(s.start_s) === item.t_s);
    const options = item.options.map((option, o) => `${o}. ${option}`).join("\n");
    return `Question ${i + 1}: ${item.question}\n${options}\nSegment: ${segment?.transcript ?? ""}`;
  });
  return [
    {
      role: "system",
      content: `You check multiple-choice questions against the lecture segment each was written from.

For each question, decide which single option the segment supports. Use only the segment, not your own knowledge. If the segment supports none of the options, or more than one, answer null.
Reply with only a JSON array, no markdown: [{"question": 1, "answer": 0}]`,
    },
    { role: "user", content: blocks.join("\n\n") },
  ];
}

/**
 * Keeps the questions where the second look picked the option that was marked correct. A generated question
 * can mark a wrong option (one did: it contradicted the running time its own segment states), and a student
 * can't tell, so a question that fails this check is dropped rather than shown.
 */
export function keepVerified(items: PracticeItem[], reply: string): PracticeItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(reply.slice(reply.indexOf("["), reply.lastIndexOf("]") + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const picked = new Map<number, unknown>();
  for (const row of parsed) {
    if (row && typeof row === "object" && typeof row.question === "number") picked.set(row.question, row.answer);
  }
  return items.filter((item, i) => picked.get(i + 1) === item.correct);
}

/** The stored set, or [] when the column holds nothing usable (including sets from before multiple choice). */
export function readPractice(stored: unknown): PracticeItem[] {
  if (!Array.isArray(stored)) return [];
  const items = stored.filter(
    (p): p is PracticeItem =>
      !!p &&
      typeof p === "object" &&
      typeof p.question === "string" &&
      Array.isArray(p.options) &&
      p.options.length === OPTION_COUNT &&
      p.options.every((o: unknown) => typeof o === "string") &&
      Number.isInteger(p.correct) &&
      p.correct >= 0 &&
      p.correct < OPTION_COUNT &&
      typeof p.explanation === "string" &&
      typeof p.t_s === "number",
  );
  return items.length === stored.length ? items : [];
}
