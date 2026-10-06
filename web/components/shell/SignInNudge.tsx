"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const VISIBLE_MS = 5000;
const SEEN_KEY = "sign-in-nudge-seen";

/** Shown to visitors who aren't signed in: a short reminder that signing in lifts the daily question limit. */
export function SignInNudge() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Once per browser tab, so it doesn't reappear on every page load.
    try {
      if (sessionStorage.getItem(SEEN_KEY)) return;
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Storage can be blocked (private mode); showing the reminder again is harmless.
    }
    const show = setTimeout(() => setVisible(true), 0);
    const hide = setTimeout(() => setVisible(false), VISIBLE_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, []);

  if (!visible) return null;
  return (
    <div
      role="status"
      className="fixed right-4 bottom-4 left-4 z-50 flex items-center gap-4 rounded-card bg-ink px-5 py-4 text-sm text-white shadow-card sm:left-auto sm:max-w-sm"
    >
      <p className="flex-1">
        Please{" "}
        <Link href="/login" className="font-bold text-lime underline">
          log in
        </Link>{" "}
        so that you can ask more than 20 questions.
      </p>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Dismiss"
        className="grid size-7 shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/20"
      >
        ×
      </button>
    </div>
  );
}
