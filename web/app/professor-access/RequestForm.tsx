"use client";

import { useActionState } from "react";
import { requestAccess, type RequestState } from "./actions";

const INPUT = "w-full rounded-2xl bg-canvas px-5 py-3 text-[15px] font-normal placeholder:text-muted";

export function RequestForm() {
  const [state, action, pending] = useActionState<RequestState, FormData>(requestAccess, {});

  return (
    <form action={action} className="grid gap-5">
      {state.error && (
        <p role="alert" className="rounded-2xl bg-red-50 px-5 py-3 text-sm font-semibold text-red-900">
          {state.error}
        </p>
      )}
      <label className="grid gap-2 text-sm font-bold">
        Your name
        <input name="name" type="text" required maxLength={80} autoComplete="name" className={INPUT} />
      </label>
      <label className="grid gap-2 text-sm font-bold">
        Where you teach
        <input name="affiliation" type="text" required maxLength={120} placeholder="University or school" className={INPUT} />
      </label>
      <label className="grid gap-2 text-sm font-bold">
        What you plan to upload
        <textarea name="note" required maxLength={500} rows={3} placeholder="Course and roughly how many lectures" className={INPUT} />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-full bg-lime px-8 py-3.5 text-[15px] font-bold transition-colors hover:bg-ink hover:text-lime disabled:opacity-50"
      >
        {pending ? "Sending…" : "Request access"}
      </button>
    </form>
  );
}
