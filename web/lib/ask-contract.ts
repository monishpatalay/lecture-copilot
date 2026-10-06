import type { ApiResponse } from "./api";
import type { ResolvedCitation } from "./citations";

/** The request/response contract of POST /api/ask, shared with the Ask panel. */
export const MAX_QUESTION_CHARS = 500;

/** One cited segment, for the Sources list under an answer. */
export type Source = {
  segmentId: string;
  lectureId: string;
  lectureNumber: number;
  startS: number;
  endS: number;
  excerpt: string;
};

// `model` is null when the relevance gate answered without calling a model.
export type AskData = {
  answer: string;
  covered: boolean;
  citations: ResolvedCitation[];
  sources: Source[];
  model: string | null;
};

export type AskResponse = ApiResponse<AskData>;

/** How many earlier exchanges the panel sends along so a follow-up can be understood. */
export const MAX_TURNS = 3;

/**
 * With `stream: true` in the request, the reply is newline-delimited JSON: the answer text as it is written,
 * then `done` carrying the same envelope the plain response has. Only `done` is verified; `restart` means the
 * text so far was withdrawn (failed citation check, or the fallback model took over).
 */
export type AskStreamEvent = { type: "delta"; text: string } | { type: "restart" } | ({ type: "done" } & AskResponse);
