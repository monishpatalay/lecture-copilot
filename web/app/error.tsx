"use client"; // error boundaries must be client components

import { useEffect } from "react";

/** Shown in place of a page that failed, with the sidebar still there. The details go to the server log. */
export default function PageError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Something went wrong</h1>
      <section className="mt-10 max-w-xl rounded-card bg-card p-7 shadow-card sm:p-9">
        <p className="text-muted">That didn&apos;t work. Nothing was lost; try it again, and if it keeps happening, reload the page.</p>
        {error.digest && <p className="mt-3 text-xs text-muted">Reference: {error.digest}</p>}
        <button
          type="button"
          onClick={() => retry()}
          className="mt-6 rounded-full bg-lime px-8 py-3.5 text-[15px] font-bold transition-colors hover:bg-ink hover:text-lime"
        >
          Try again
        </button>
      </section>
    </>
  );
}
