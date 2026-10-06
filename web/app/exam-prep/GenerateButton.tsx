"use client";

import { useActionState } from "react";
import { generatePractice, type PracticeState } from "./actions";

export function GenerateButton({ lectureId }: { lectureId: string }) {
  const [state, action, pending] = useActionState<PracticeState, FormData>(generatePractice, {});
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="lectureId" value={lectureId} />
      {state.error && (
        <p role="alert" className="rounded-2xl bg-red-50 px-5 py-3 text-sm font-semibold text-red-900">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-full bg-lime px-8 py-3.5 text-[15px] font-bold transition-colors hover:bg-ink hover:text-lime disabled:opacity-50"
      >
        {pending ? "Writing questions… about 10 seconds" : "Make practice questions"}
      </button>
    </form>
  );
}
