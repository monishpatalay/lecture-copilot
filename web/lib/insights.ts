export type QuestionRow = {
  text: string;
  covered: boolean | null; // null: the answer step failed
  cited_segment_ids: string[];
  latency_ms: number | null;
  feedback: number | null; // 1 thumbs up, -1 thumbs down
  user_hash: string | null;
  created_at: string;
};

export type Summary = {
  total: number;
  askers: number;
  answered: number;
  notCovered: number;
  medianLatencyMs: number | null;
  helpful: number;
  notHelpful: number;
  /** Most recent answered questions that got a thumbs down. */
  unhelpful: { text: string; created_at: string }[];
  /** Most recent questions the lectures didn't cover, without repeats. */
  gaps: { text: string; created_at: string }[];
  /** Segments cited by the most answers. */
  topSegments: { segmentId: string; count: number }[];
  /** Answered questions that cited each lecture. */
  perLecture: Map<string, number>;
};

const GAPS_SHOWN = 8;
const SEGMENTS_SHOWN = 5;

/** `rows` newest first; `lectureOfSegment` maps a segment id to its lecture id. */
export function summarizeQuestions(rows: QuestionRow[], lectureOfSegment: Map<string, string>): Summary {
  const latencies = rows.flatMap((r) => (r.latency_ms === null ? [] : [r.latency_ms])).sort((a, b) => a - b);
  const segmentCounts = new Map<string, number>();
  const perLecture = new Map<string, number>();
  const gaps = new Map<string, { text: string; created_at: string }>();

  for (const row of rows) {
    if (row.covered === false) {
      const key = row.text.trim().toLowerCase();
      if (!gaps.has(key)) gaps.set(key, { text: row.text, created_at: row.created_at });
    }
    const lectures = new Set<string>();
    for (const id of row.cited_segment_ids) {
      segmentCounts.set(id, (segmentCounts.get(id) ?? 0) + 1);
      const lecture = lectureOfSegment.get(id);
      if (lecture) lectures.add(lecture);
    }
    for (const lecture of lectures) perLecture.set(lecture, (perLecture.get(lecture) ?? 0) + 1);
  }

  return {
    total: rows.length,
    askers: new Set(rows.map((r) => r.user_hash)).size,
    answered: rows.filter((r) => r.covered === true).length,
    notCovered: rows.filter((r) => r.covered === false).length,
    medianLatencyMs: latencies.length ? latencies[Math.floor((latencies.length - 1) / 2)] : null,
    helpful: rows.filter((r) => r.feedback === 1).length,
    notHelpful: rows.filter((r) => r.feedback === -1).length,
    unhelpful: rows.filter((r) => r.feedback === -1).slice(0, GAPS_SHOWN).map((r) => ({ text: r.text, created_at: r.created_at })),
    gaps: [...gaps.values()].slice(0, GAPS_SHOWN),
    topSegments: [...segmentCounts]
      .sort((a, b) => b[1] - a[1])
      .slice(0, SEGMENTS_SHOWN)
      .map(([segmentId, count]) => ({ segmentId, count })),
    perLecture,
  };
}
