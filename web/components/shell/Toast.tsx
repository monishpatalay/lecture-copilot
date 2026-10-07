"use client";

import { useEffect, useState } from "react";

const VISIBLE_MS = 5000;

/** A short confirmation in the corner that goes away by itself. Give it a `key` to show it again for a new event. */
export function Toast({ message }: { message: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const hide = setTimeout(() => setVisible(false), VISIBLE_MS);
    return () => clearTimeout(hide);
  }, []);

  if (!visible) return null;
  return (
    <div
      role="status"
      className="fixed right-4 bottom-4 left-4 z-50 flex items-center gap-4 rounded-card bg-ink px-5 py-4 text-sm font-semibold text-white shadow-card sm:left-auto sm:max-w-sm"
    >
      <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-lime text-ink">
        ✓
      </span>
      <p className="flex-1">{message}</p>
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
