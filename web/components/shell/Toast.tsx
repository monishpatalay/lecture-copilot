"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const VISIBLE_MS = 5000;
const EVENT = "lecture-copilot:toast";
const FLASH_COOKIE = /(?:^|; )flash=([^;]*)/;

type Kind = "ok" | "error";

/** Shows a pop-up from client code, e.g. after a fetch succeeds. */
export function showToast(message: string, kind: Kind = "ok"): void {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { message, kind } }));
}

/**
 * The one place confirmations appear: top centre, for five seconds. Mounted once in the root layout.
 * Client code calls showToast(). Server actions call flash() (lib/flash.ts), which leaves the message in a
 * short-lived cookie; `flash` changes when that cookie does, and the message is read and cleared here.
 */
export function ToastHost({ flash }: { flash: string | null }) {
  const [toast, setToast] = useState<{ id: number; message: string; kind: Kind } | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    const onToast = (event: Event) => setToast({ id: Date.now(), ...(event as CustomEvent<{ message: string; kind: Kind }>).detail });
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  // After a server action (flash changed) or a redirect it caused (pathname changed), pick up its message.
  useEffect(() => {
    const match = document.cookie.match(FLASH_COOKIE);
    if (!match) return;
    document.cookie = "flash=; Max-Age=0; path=/";
    // "<timestamp>|<kind>|<message>": the timestamp only makes each value unique.
    const [, kind, ...rest] = decodeURIComponent(match[1]).split("|");
    if (rest.length) showToast(rest.join("|"), kind === "error" ? "error" : "ok");
  }, [flash, pathname]);

  useEffect(() => {
    if (!toast) return;
    const hide = setTimeout(() => setToast(null), VISIBLE_MS);
    return () => clearTimeout(hide);
  }, [toast]);

  if (!toast) return null;
  return (
    <div
      role={toast.kind === "error" ? "alert" : "status"}
      className={`fixed top-4 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-4 rounded-card px-5 py-4 text-[15px] font-bold text-ink shadow-[0_12px_40px_-8px_rgb(22_24_29/0.45)] ring-2 ring-ink ${
        toast.kind === "error" ? "bg-red-200" : "bg-lime"
      }`}
    >
      <span aria-hidden className={`grid size-8 shrink-0 place-items-center rounded-full bg-ink ${toast.kind === "error" ? "text-red-200" : "text-lime"}`}>
        {toast.kind === "error" ? "!" : "✓"}
      </span>
      <p className="flex-1">{toast.message}</p>
      <button
        type="button"
        onClick={() => setToast(null)}
        aria-label="Dismiss"
        className="grid size-8 shrink-0 place-items-center rounded-full bg-ink/10 hover:bg-ink/20"
      >
        ×
      </button>
    </div>
  );
}
