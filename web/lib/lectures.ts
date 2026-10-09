import { UUID } from "./api";

/** Rules and wording for lecture uploads, shared by the API routes and the browser. */
export const MAX_UPLOAD_BYTES = 2 * 1024 ** 3;
/** Checked in the browser before uploading, and again by the worker (`MAX_SECONDS` in validate.py). */
export const MAX_LECTURE_SECONDS = 2 * 60 * 60;
export const TOO_LONG = "This video is longer than 2 hours. Please upload a lecture that is under 2 hours.";

const CONTENT_TYPES = { mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" } as const;
type Extension = keyof typeof CONTENT_TYPES;

export type NewLecture = { courseId: string; number: number; title: string; extension: Extension; contentType: string };

/** What GET /api/lectures/:id returns. */
export type LectureState = {
  id: string;
  courseId: string;
  number: number;
  title: string;
  status: string;
  stage: string | null;
  progress: number;
  error: string | null;
  workerOnline: boolean;
};

/** What POST /api/lectures returns: where the browser should PUT the file. */
export type UploadTicket = { lectureId: string; uploadUrl: string; contentType: string };

export function validateNewLecture(body: unknown): { ok: true; value: NewLecture } | { ok: false; error: string } {
  const invalid = (error: string) => ({ ok: false as const, error });
  const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;

  if (typeof b.courseId !== "string" || !UUID.test(b.courseId)) return invalid("Choose a course.");
  if (typeof b.number !== "number" || !Number.isInteger(b.number) || b.number < 1 || b.number > 999) {
    return invalid("Lecture number must be a whole number from 1 to 999.");
  }
  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (!title || title.length > 200) return invalid("Give the lecture a title of up to 200 characters.");

  const extension = typeof b.fileName === "string" ? b.fileName.split(".").pop()?.toLowerCase() : undefined;
  // hasOwn, not `in`: "constructor" is `in` every object.
  if (!extension || !Object.hasOwn(CONTENT_TYPES, extension)) return invalid("Upload an MP4, MOV or WebM video.");
  if (typeof b.fileSize !== "number" || !Number.isInteger(b.fileSize) || b.fileSize < 1) {
    return invalid("That file is empty.");
  }
  if (b.fileSize > MAX_UPLOAD_BYTES) return invalid("That file is larger than 2 GB.");
  if (b.rightsConfirmed !== true) {
    return invalid("Confirm that you have the right to upload and share this lecture.");
  }

  const ext = extension as Extension;
  return { ok: true, value: { courseId: b.courseId, number: b.number, title, extension: ext, contentType: CONTENT_TYPES[ext] } };
}

const STAGE_LABELS: Record<string, string> = {
  validate: "checking the file",
  audio: "extracting audio",
  transcribe: "transcribing",
  slides: "finding slides",
  slide_text: "reading slides",
  transcode: "preparing the video",
  chunk: "splitting into segments",
  embed: "indexing",
};

/** One line describing where a lecture is, e.g. "Processing · transcribing · 10%". */
export function describeStatus(state: Pick<LectureState, "status" | "stage" | "progress" | "workerOnline">): string {
  switch (state.status) {
    case "uploading":
      return "Uploading";
    case "queued":
      return state.workerOnline ? "Queued" : "Queued · waiting for a processor";
    case "processing":
      return `Processing · ${STAGE_LABELS[state.stage ?? ""] ?? "starting"} · ${state.progress}%`;
    case "ready":
      return "Ready";
    case "failed":
      return "Failed";
    default:
      return state.status;
  }
}
