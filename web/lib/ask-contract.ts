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
