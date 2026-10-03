import type { Database } from "./database.types";
import { formatTimestamp } from "./time";

/** One retrieved segment, as returned by the match_segments SQL function. */
export type Segment = Database["public"]["Functions"]["match_segments"]["Returns"][number];

export type Citation = {
  raw: string; // exactly as written in the answer, e.g. "[L4 · 23:34]"
  lectureNumber: number;
  seconds: number;
};

/** A citation that was matched to a retrieved segment. */
export type ResolvedCitation = Citation & { segmentId: string; lectureId: string };

export type CitationCheck =
  | { ok: true; citations: ResolvedCitation[] }
  | { ok: false; problem: string }; // worded so it can be sent back to the model

// [L4 · 23:34] or [L4 · 1:02:03]. Models vary the punctuation: any single mark passes as the separator, and
// 【 】 or ［ ］ pass as the brackets (gpt-oss often writes 【L4 · 16:09】). What matters is that the lecture and
// time match a retrieved segment.
const CITATION = /[\[【［]L(\d+)\s*[^\w\s\]】］]?\s*(\d+:\d{2}(?::\d{2})?)\s*[\]】］]/g;
// Anything that looks like an attempt at a citation, well-formed or not.
const CITATION_ATTEMPT = /[\[【［]L\d+\b[^\]】］]*\d:\d\d[^\]】］]*[\]】］]/g;

/** "L4 · 23:34": the text inside a citation's brackets. */
export function citationText(lectureNumber: number, seconds: number): string {
  return `L${lectureNumber} · ${formatTimestamp(seconds)}`;
}

/** Splits an answer into plain text and citations, in reading order. */
export function splitByCitations(answer: string): (string | Citation)[] {
  const parts: (string | Citation)[] = [];
  let cursor = 0;
  for (const match of answer.matchAll(CITATION)) {
    if (match.index > cursor) parts.push(answer.slice(cursor, match.index));
    const [raw, lecture, time] = match;
    const seconds = time.split(":").reduce((total, part) => total * 60 + Number(part), 0);
    parts.push({ raw, lectureNumber: Number(lecture), seconds });
    cursor = match.index + raw.length;
  }
  if (cursor < answer.length) parts.push(answer.slice(cursor));
  return parts;
}

export function parseCitations(answer: string): Citation[] {
  return splitByCitations(answer).filter((part): part is Citation => typeof part !== "string");
}

/**
 * Every citation must point into a retrieved segment: same lecture, time within the segment.
 * An answer with no citations, or with a citation the parser can't read, fails too.
 */
export function validateCitations(
  answer: string,
  segments: Pick<Segment, "id" | "lecture_id" | "lecture_number" | "start_s" | "end_s">[],
): CitationCheck {
  const citations = parseCitations(answer);
  if (citations.length === 0) return { ok: false, problem: "The answer has no citations." };
  if ((answer.match(CITATION_ATTEMPT) ?? []).length !== citations.length) {
    return { ok: false, problem: "A citation is malformed. Write exactly one [L<number> · mm:ss] per bracket." };
  }

  const resolved: ResolvedCitation[] = [];
  for (const citation of citations) {
    const inLecture = segments.filter((s) => s.lecture_number === citation.lectureNumber);
    // Labels shown to the model are segment starts floored to whole seconds. Look for that exact label first:
    // neighboring segments share their boundary second, so a plain range check can credit the previous one.
    const segment =
      inLecture.find((s) => Math.floor(s.start_s) === citation.seconds) ??
      inLecture.find((s) => citation.seconds >= Math.floor(s.start_s) && citation.seconds <= s.end_s);
    if (!segment) return { ok: false, problem: `${citation.raw} is not one of the provided segments.` };
    resolved.push({ ...citation, segmentId: segment.id, lectureId: segment.lecture_id });
  }
  return { ok: true, citations: resolved };
}
