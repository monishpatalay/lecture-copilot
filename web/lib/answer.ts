import { citationText, validateCitations, type ResolvedCitation, type Segment } from "./citations";
import { complete, type Message } from "./llm";

export type Answer =
  | { status: "answered"; text: string; citations: ResolvedCitation[]; model: string }
  | { status: "not_covered"; model: string | null } // model is null when the LLM was never called
  | { status: "unverifiable"; model: string }; // citations failed validation twice

// Below this, nothing relevant was retrieved and the LLM isn't called at all.
// ponytail: placeholder from a handful of probes (off-topic ≈ 0.69–0.76, on-topic ≈ 0.78–0.92).
// Tune on the eval set in Phase 2.
const MIN_SIMILARITY = 0.75;

const SYSTEM_PROMPT = `You answer students' questions about a course using only the lecture segments you are given.

Rules:
- Use only information from the segments. Never add outside knowledge.
- After each claim, cite the segment it came from by copying that segment's label exactly, for example [L4 · 23:34]. Write one citation per bracket.
- If the segments do not answer the question, reply with exactly NOT_COVERED and nothing else.
- Answer in plain text of at most 150 words. No markdown.`;

function buildPrompt(question: string, segments: Segment[]): string {
  const blocks = segments.map((s) => {
    const lines = [`[${citationText(s.lecture_number, s.start_s)}]`, `Transcript: ${s.transcript}`];
    if (s.slide_text) lines.push(`Slide: ${s.slide_text}`);
    return lines.join("\n");
  });
  return `Lecture segments:\n\n${blocks.join("\n\n")}\n\nQuestion: ${question}`;
}

function judge(reply: { text: string; model: string }, segments: Segment[]): Answer | { status: "invalid"; problem: string } {
  if (reply.text.includes("NOT_COVERED")) return { status: "not_covered", model: reply.model };
  const check = validateCitations(reply.text, segments);
  if (!check.ok) return { status: "invalid", problem: check.problem };
  return { status: "answered", text: reply.text.trim(), citations: check.citations, model: reply.model };
}

/** Writes an answer from the retrieved segments. Citations are checked in code, with one retry. */
export async function generateAnswer(question: string, segments: Segment[]): Promise<Answer> {
  if (Math.max(...segments.map((s) => s.similarity)) < MIN_SIMILARITY) {
    return { status: "not_covered", model: null };
  }

  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildPrompt(question, segments) },
  ];
  const first = await complete(messages);
  const verdict = judge(first, segments);
  if (verdict.status !== "invalid") return verdict;

  // Regenerate once, telling the model what was wrong with its citations.
  const second = await complete([
    ...messages,
    { role: "assistant", content: first.text },
    { role: "user", content: `${verdict.problem} Rewrite the answer, citing only the labels of the segments above.` },
  ]);
  const retry = judge(second, segments);
  return retry.status === "invalid" ? { status: "unverifiable", model: second.model } : retry;
}
