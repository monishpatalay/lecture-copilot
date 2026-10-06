import type { Message } from "./llm";

export type PracticeItem = { question: string; answer: string; t_s: number };
type SourceSegment = { start_s: number; transcript: string };

// One question per segment. Eight segments is about 2.5K tokens, well inside Groq's 8K tokens a minute.
const QUESTION_COUNT = 8;
const MAX_QUESTION_CHARS = 300;
const MAX_ANSWER_CHARS = 700;

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
      content: `You write practice exam questions from lecture transcript segments.

Rules:
- Write one question per segment, answerable from that segment alone. It should test understanding of the material, not recall of the lecturer's exact words.
- Give a model answer of one to three sentences that uses only what the segment says.
- Skip a segment that has nothing examinable (greetings, logistics, jokes).
- Reply with only a JSON array, no markdown: [{"segment": 1, "question": "...", "answer": "..."}]`,
    },
    { role: "user", content: blocks.join("\n\n") },
  ];
}

/** Keeps the well-formed items of the model's reply that point at one of the given segments, one per segment. */
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
    const { segment, question, answer } = item as Record<string, unknown>;
    if (typeof segment !== "number" || !Number.isInteger(segment) || !segments[segment - 1] || bySegment.has(segment)) continue;
    if (typeof question !== "string" || typeof answer !== "string") continue;
    const q = question.trim();
    const a = answer.trim();
    if (!q || !a || q.length > MAX_QUESTION_CHARS || a.length > MAX_ANSWER_CHARS) continue;
    bySegment.set(segment, { question: q, answer: a, t_s: Math.floor(segments[segment - 1].start_s) });
  }
  return [...bySegment.values()].sort((x, y) => x.t_s - y.t_s);
}
