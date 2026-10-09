import { citationText, type Segment } from "./citations";
import { formatTimestamp } from "./time";

/** What the course outline is built from: a ready lecture's row. `chapters` is stored JSON, so it is checked here. */
export type OutlineLecture = { id: string; number: number; title: string; duration_s: number | null; chapters: unknown };

type Chapter = { t_s: number; title: string };

function chaptersOf(lecture: OutlineLecture): Chapter[] {
  return (Array.isArray(lecture.chapters) ? lecture.chapters : []).filter(
    (c): c is Chapter => typeof c?.t_s === "number" && typeof c?.title === "string",
  );
}

/**
 * The course outline in the shape of retrieved segments, one per lecture spanning the whole lecture, so an
 * answer written from the outline goes through the same citation check: a label is valid when it names a
 * real lecture and a time inside it. The ids are not real segment ids.
 */
export function outlineSegments(lectures: OutlineLecture[]): Segment[] {
  return lectures.map((lecture) => ({
    id: `outline-${lecture.id}`,
    lecture_id: lecture.id,
    lecture_number: lecture.number,
    start_s: 0,
    end_s: lecture.duration_s ?? Number.MAX_SAFE_INTEGER,
    transcript: lecture.title,
    slide_text: "",
    similarity: 1,
    score: 1,
  }));
}

/** The outline as the model reads it: every lecture and chapter on its own line, starting with its label. */
export function outlineText(courseTitle: string, lectures: OutlineLecture[]): string {
  const blocks = lectures.map((lecture) => {
    const length = lecture.duration_s ? `, ${formatTimestamp(lecture.duration_s)} long` : "";
    const head = `[${citationText(lecture.number, 0)}] Lecture ${lecture.number}: ${lecture.title}${length}`;
    const chapters = chaptersOf(lecture).map((c) => `[${citationText(lecture.number, c.t_s)}] ${c.title}`);
    return chapters.length ? `${head}\nChapters:\n${chapters.join("\n")}` : head;
  });
  return `Course: ${courseTitle}\nNumber of lectures: ${lectures.length}\n\n${blocks.join("\n\n")}`;
}
