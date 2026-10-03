import type { ApiResponse } from "./api";
import type { ResolvedCitation } from "./citations";

/** The request/response contract of POST /api/ask, shared with the Ask panel. */
export const MAX_QUESTION_CHARS = 500;

export type AskData = { answer: string; covered: boolean; citations: ResolvedCitation[] };

export type AskResponse = ApiResponse<AskData>;
