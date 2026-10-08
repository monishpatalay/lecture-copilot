import { completeQuick } from "./llm";

/** How many search results are read by the reranker, and how many it passes on to the answer model. */
export const CANDIDATES = 12;
const KEEP = 6;
const PASSAGE_CHARS = 1200; // a whole 60–90 s segment; longer ones are cut so twelve of them stay a small prompt

/**
 * The 0-based positions the model picked, best first, from a reply like "[3, 1, 7]". Numbers out of range and
 * repeats are dropped. Null when the reply has no list at all.
 */
export function parseRanking(reply: string, count: number): number[] | null {
  const list = reply.match(/\[[\d,\s]*\]/);
  if (!list) return null;
  const picked = (JSON.parse(list[0]) as number[]).filter((n) => Number.isInteger(n) && n >= 1 && n <= count).map((n) => n - 1);
  return [...new Set(picked)];
}

/**
 * Search finds the right passage among its top twelve more often than among its top six (97% against 93% on
 * the eval set), and often not first. A small model reads the twelve against the question and picks the six
 * to keep, best first: on the eval set that puts the right passage first 88% of the time instead of 69%.
 * If the model is slow, busy or replies with nonsense, the search order is used as it was.
 */
export async function rerank<T extends { transcript: string }>(question: string, segments: T[]): Promise<T[]> {
  if (segments.length <= KEEP) return segments;
  const passages = segments.map((s, i) => `[${i + 1}] ${s.transcript.slice(0, PASSAGE_CHARS)}`).join("\n\n");
  try {
    const reply = await completeQuick([
      {
        role: "user",
        content: `A student asked: ${question}\n\nBelow are ${segments.length} passages from lecture transcripts. Pick the ${KEEP} passages most likely to contain the answer, best first. Reply with only a JSON array of their numbers, for example [3, 1, 7, 2, 9, 4].\n\n${passages}`,
      },
    ]);
    const picked = parseRanking(reply, segments.length);
    if (!picked?.length) return segments.slice(0, KEEP);
    // Whatever the model left out follows in search order, so a short list still yields six.
    const rest = segments.map((_, i) => i).filter((i) => !picked.includes(i));
    return [...picked, ...rest].slice(0, KEEP).map((i) => segments[i]);
  } catch (error) {
    console.warn(`rerank skipped (${error instanceof Error ? error.message : error}); using search order`);
    return segments.slice(0, KEEP);
  }
}
