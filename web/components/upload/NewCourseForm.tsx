"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { showToast } from "@/components/shell/Toast";
import type { ApiResponse } from "@/lib/api";

export function NewCourseForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: new FormData(form).get("title") }),
      });
      const body: ApiResponse<{ id: string }> = await res.json();
      if (!body.success) return setError(body.error);
      form.reset();
      showToast("The new course has been created.");
      router.refresh(); // the new course appears in the upload form's list
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <label className="grid gap-2 text-sm font-bold">
        New course
        <input
          name="title"
          type="text"
          required
          maxLength={120}
          placeholder="Course title"
          className="w-full rounded-2xl bg-canvas px-5 py-3 text-[15px] font-normal placeholder:text-muted"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-800">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={saving}
        className="w-fit rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-lime hover:text-ink disabled:opacity-50"
      >
        {saving ? "Creating…" : "Create course"}
      </button>
    </form>
  );
}
