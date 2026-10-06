"use client";

import { useActionState } from "react";
import { generatePractice, type PracticeState } from "./actions";

/** `replace`: the professor's button under an existing set, which writes a new one. */
export function GenerateButton({ lectureId, replace = false }: { lectureId: string; replace?: boolean }) {
  const [state, action, pending] = useActionState<PracticeState, FormData>(generatePractice, {});
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="lectureId" value={lectureId} />
      {replace && <input type="hidden" name="replace" value="1" />}
      {state.error && (
        <p role="alert" className="rounded-2xl bg-red-50 px-5 py-3 text-sm font-semibold text-red-900">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className={`w-fit rounded-full font-bold transition-colors disabled:opacity-50 ${
          replace ? "bg-card px-5 py-2.5 text-sm hover:bg-lavender" : "bg-lime px-8 py-3.5 text-[15px] hover:bg-ink hover:text-lime"
        }`}
      >
        {pending ? "Writing questions… about 10 seconds" : replace ? "Write a new set of questions" : "Make practice questions"}
      </button>
    </form>
  );
}
