"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ApiResponse } from "@/lib/api";
import { describeStatus, type LectureState } from "@/lib/lectures";

const POLL_MS = 3000;

// Dark track with a lime fill: lime on the light canvas would be too faint to read.
export const PROGRESS_BAR =
  "h-2.5 w-full appearance-none overflow-hidden rounded-full bg-ink [&::-moz-progress-bar]:bg-lime [&::-webkit-progress-bar]:bg-ink [&::-webkit-progress-value]:bg-lime [&::-webkit-progress-value]:transition-all";

/** Live status of a lecture that is still on its way. Polls until it is ready or has failed. */
export function LectureProgress({
  lectureId,
  initial,
  refreshOnReady = false,
  canRetry = true,
}: {
  lectureId: string;
  initial?: LectureState;
  refreshOnReady?: boolean; // re-render the surrounding server page when the lecture becomes ready
  canRetry?: boolean; // only the course's instructor may retry; the API enforces it too
}) {
  const router = useRouter();
  const [state, setState] = useState<LectureState | null>(initial ?? null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const settled = state?.status === "ready" || state?.status === "failed";

  useEffect(() => {
    if (settled) return;
    let stopped = false;
    const poll = async () => {
      try {
        const body: ApiResponse<LectureState> = await (await fetch(`/api/lectures/${lectureId}`)).json();
        if (!stopped && body.success) setState(body.data);
      } catch {
        // A missed poll is fine: the next one is three seconds away.
      }
    };
    void poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [lectureId, settled]);

  useEffect(() => {
    if (refreshOnReady && state?.status === "ready") router.refresh();
  }, [refreshOnReady, state?.status, router]);

  async function retry() {
    setRetryError(null);
    try {
      const res = await fetch(`/api/lectures/${lectureId}/retry`, { method: "POST" });
      const body: ApiResponse<LectureState> = await res.json();
      if (body.success) setState(body.data);
      else setRetryError(body.error);
    } catch {
      setRetryError("Couldn't reach the server. Try again.");
    }
  }

  if (!state) return <p className="text-sm text-muted">Checking status…</p>;

  return (
    <div className="grid gap-2 text-sm">
      <p aria-live="polite" className={state.status === "failed" ? "font-bold text-red-800" : "text-muted"}>
        {describeStatus(state)}
      </p>
      {state.status === "processing" && (
        <progress value={state.progress} max={100} aria-label="Processing progress" className={PROGRESS_BAR} />
      )}
      {state.status === "failed" && (
        <>
          {state.error && <p className="text-ink/80">{state.error}</p>}
          {canRetry && (<button
            type="button"
            onClick={retry}
            className="w-fit rounded-full bg-ink px-4 py-1.5 text-xs font-bold text-white transition-colors hover:bg-lime hover:text-ink"
          >
            Retry
          </button>)}
          {retryError && (
            <p role="alert" className="text-red-800">
              {retryError}
            </p>
          )}
        </>
      )}
      {state.status === "ready" && !refreshOnReady && (
        <Link
          href={`/lectures/${state.id}`}
          className="w-fit rounded-full bg-lime px-5 py-2 font-bold transition-colors hover:bg-ink hover:text-lime"
        >
          Open lecture →
        </Link>
      )}
    </div>
  );
}
