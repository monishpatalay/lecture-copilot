"use client";

import { useActionState } from "react";
import { sendSignInLink, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendSignInLink, {});

  if (state.sent) {
    return (
      <p role="status" className="rounded-2xl bg-lime px-5 py-4 font-semibold">
        Check {state.sent} for a sign-in link. It works once and expires in an hour.
      </p>
    );
  }
  return (
    <form action={action} className="grid gap-5">
      {state.error && (
        <p role="alert" className="rounded-2xl bg-red-50 px-5 py-3 text-sm font-semibold text-red-900">
          {state.error}
        </p>
      )}
      <label className="grid gap-2 text-sm font-bold">
        Email
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@university.edu"
          className="w-full rounded-2xl bg-canvas px-5 py-3 text-[15px] font-normal placeholder:text-muted"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-full bg-lime px-8 py-3.5 text-[15px] font-bold transition-colors hover:bg-ink hover:text-lime disabled:opacity-50"
      >
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
