"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

/** A submit button for server-action forms that says what is happening while the action runs. */
export function SubmitButton({
  pendingText,
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { pendingText: string }) {
  const { pending } = useFormStatus();
  return (
    <button {...rest} type="submit" disabled={pending} className={`${className} disabled:cursor-wait disabled:opacity-60`}>
      {pending ? pendingText : children}
    </button>
  );
}
