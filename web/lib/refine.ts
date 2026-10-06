import { splitByCitations, type ResolvedCitation, type Segment } from "./citations";

/** One line of transcript.json, as written by the worker. */
export type Line = { start: number; end: number; text: string };

// A citation used to point at the start of its 60–90 s segment, so the words that support the answer could
// begin up to half a minute after the seek. This finds the stretch of the segment that says what the answer
// says and points there instead. Word overlap is enough: answers are written from these very lines.
const WINDOW_SECONDS = 12;
const MIN_SHARED_TERMS = 2; // fewer than this is a coincidence; keep the segment start

const STOPWORDS = new Set(
  "the and for that this with are was were you your can has have had not but its it's from they them then than there their what when where which who why how will would could should about into over under just like also very more most some such each any all one two our out get got going know thing things actually really right okay well kind sort mean means said say says does did done being been because these those here only other".split(
    " ",
  ),
);

/** Lowercased content words, with a plural "s" dropped so "keys" matches "key". */
export function terms(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word))
    .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word));
}

/** The start of the stretch of `lines` that shares the most (and rarest) words with `claim`, or null if none does. */
export function bestMoment(claim: string, lines: Line[]): number | null {
  const wanted = new Set(terms(claim));
  const shared = lines.map((line) => new Set(terms(line.text).filter((term) => wanted.has(term))));
  const linesWith = new Map<string, number>();
  for (const set of shared) for (const term of set) linesWith.set(term, (linesWith.get(term) ?? 0) + 1);
  // A word the lecturer says in every line tells us little about where; a word said once tells us a lot.
  const weight = (term: string) => Math.log(1 + lines.length / linesWith.get(term)!);

  let best: { score: number; start: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (shared[i].size === 0) continue; // the stretch starts on a line that matches, so the seek lands on the point
    const seen = new Set<string>();
    for (let j = i; j < lines.length && lines[j].start - lines[i].start <= WINDOW_SECONDS; j++) {
      for (const term of shared[j]) seen.add(term);
    }
    const score = [...seen].reduce((total, term) => total + weight(term), 0);
    // On a tie the later start wins: its first line adds nothing the earlier one's stretch didn't already have.
    if (seen.size >= MIN_SHARED_TERMS && (!best || score >= best.score)) best = { score, start: lines[i].start };
  }
  return best ? best.start : null;
}

/**
 * Moves each citation from the start of its segment to the moment inside it that supports the sentence it
 * follows. A citation stays where it was when its lecture's lines are missing or nothing matches clearly.
 */
export function refineCitations(
  answer: string,
  citations: ResolvedCitation[],
  segments: Pick<Segment, "id" | "start_s" | "end_s">[],
  linesByLecture: Map<string, Line[]>,
): ResolvedCitation[] {
  const refined: ResolvedCitation[] = [];
  let claim = "";
  for (const part of splitByCitations(answer)) {
    if (typeof part === "string") {
      if (terms(part).length >= MIN_SHARED_TERMS) claim = part; // "[a][b]" or "[a]. [b]": both back the same sentence
      continue;
    }
    const citation = citations[refined.length];
    const segment = segments.find((s) => s.id === citation.segmentId);
    const lines = linesByLecture.get(citation.lectureId);
    const moment =
      segment && lines
        ? bestMoment(claim, lines.filter((line) => line.start >= Math.floor(segment.start_s) && line.start < segment.end_s))
        : null;
    refined.push(moment === null ? citation : { ...citation, seconds: Math.floor(moment) });
  }
  return refined;
}
