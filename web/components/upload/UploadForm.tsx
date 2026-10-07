"use client";

import { useRef, useState, type FormEvent } from "react";
import { LectureProgress, PROGRESS_BAR } from "@/components/lecture/LectureProgress";
import { Toast } from "@/components/shell/Toast";
import type { ApiResponse } from "@/lib/api";
import { MAX_UPLOAD_BYTES, type LectureState, type UploadTicket } from "@/lib/lectures";

type Step =
  | { name: "form" }
  | { name: "uploading"; sent: number; total: number }
  | { name: "tracking"; lectureId: string; title: string };

const FIELD = "w-full rounded-2xl bg-canvas px-5 py-3 text-[15px] font-normal placeholder:text-muted";
const megabytes = (bytes: number) => (bytes / 1_000_000).toFixed(1);

async function post<T>(url: string, body?: unknown): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return await res.json();
  } catch {
    return { success: false, data: null, error: "Couldn't reach the server. Check your connection and try again." };
  }
}

/** PUTs the file straight to storage. XMLHttpRequest, because fetch can't report upload progress. */
function putFile(xhr: XMLHttpRequest, ticket: UploadTicket, file: File, onProgress: (sent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    xhr.open("PUT", ticket.uploadUrl);
    xhr.setRequestHeader("Content-Type", ticket.contentType); // must match what the URL was signed for
    xhr.upload.onprogress = (event) => onProgress(event.loaded);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error("Storage refused the upload. Please try again."));
    xhr.onerror = () => reject(new Error("The upload failed. Check your connection and try again."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    xhr.send(file);
  });
}

export function UploadForm({ courses }: { courses: { id: string; title: string }[] }) {
  const [step, setStep] = useState<Step>({ name: "form" });
  const [error, setError] = useState<string | null>(null);
  const upload = useRef<XMLHttpRequest | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file") as File;
    const title = String(form.get("title")).trim();
    setError(null);
    if (file.size > MAX_UPLOAD_BYTES) return setError("That file is larger than 2 GB.");

    setStep({ name: "uploading", sent: 0, total: file.size });
    const started = await post<UploadTicket>("/api/lectures", {
      courseId: form.get("courseId"),
      number: Number(form.get("number")),
      title,
      fileName: file.name,
      fileSize: file.size,
      rightsConfirmed: form.get("rights") === "on",
    });
    if (!started.success) return fail(started.error);

    try {
      upload.current = new XMLHttpRequest();
      await putFile(upload.current, started.data, file, (sent) => setStep({ name: "uploading", sent, total: file.size }));
    } catch (problem) {
      return fail(problem instanceof Error ? problem.message : "The upload failed.");
    }

    const queued = await post<LectureState>(`/api/lectures/${started.data.lectureId}/complete`);
    if (!queued.success) return fail(queued.error);
    setStep({ name: "tracking", lectureId: started.data.lectureId, title });
  }

  function fail(message: string) {
    setStep({ name: "form" });
    setError(message);
  }

  const percent = step.name === "uploading" && step.total ? Math.round((step.sent / step.total) * 100) : 0;

  // The form stays mounted (hidden) during an upload, so a failed attempt comes back with everything still filled in.
  return (
    <>
      {step.name === "uploading" && (
        <section aria-labelledby="uploading-heading" className="grid gap-4">
          <h2 id="uploading-heading" className="text-2xl font-extrabold tracking-tight">
            Uploading… <span className="tabular-nums">{percent}%</span>
          </h2>
          <progress value={step.sent} max={step.total} aria-label="Upload progress" className={PROGRESS_BAR} />
          <p className="text-sm text-muted tabular-nums">
            {megabytes(step.sent)} of {megabytes(step.total)} MB. Keep this tab open until it finishes.
          </p>
          <button
            type="button"
            onClick={() => upload.current?.abort()}
            className="w-fit rounded-full bg-canvas px-5 py-2 text-sm font-bold transition-colors hover:bg-ink hover:text-white"
          >
            Cancel
          </button>
        </section>
      )}

      {step.name === "tracking" && (
        <section aria-labelledby="tracking-heading" className="grid gap-4">
          <Toast key={step.lectureId} message="The new lecture has been uploaded." />
          <h2 id="tracking-heading" className="text-2xl font-extrabold tracking-tight">
            Uploaded: {step.title}
          </h2>
          <p className="text-sm text-muted">
            It is now being transcribed and indexed. You can leave this page; the course page shows the same progress.
          </p>
          <LectureProgress lectureId={step.lectureId} />
          <button
            type="button"
            onClick={() => {
              formRef.current?.reset();
              setStep({ name: "form" });
            }}
            className="mt-2 w-fit rounded-full bg-canvas px-5 py-2 text-sm font-bold transition-colors hover:bg-ink hover:text-white"
          >
            Upload another lecture
          </button>
        </section>
      )}

      <form ref={formRef} onSubmit={submit} hidden={step.name !== "form"} className="grid gap-6 [&[hidden]]:hidden">
        {error && (
          <p role="alert" className="rounded-2xl bg-red-50 px-5 py-3 text-sm font-semibold text-red-900">
            {error}
          </p>
        )}

        <label className="grid gap-2 text-sm font-bold">
          Course
          <select name="courseId" required className={FIELD}>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-6 sm:grid-cols-[8rem_1fr]">
          <label className="grid gap-2 text-sm font-bold">
            Lecture no.
            <input name="number" type="number" min={1} max={999} required placeholder="5" className={FIELD} />
          </label>
          <label className="grid gap-2 text-sm font-bold">
            Title
            <input name="title" type="text" maxLength={200} required placeholder="Linear Sorting" className={FIELD} />
          </label>
        </div>

        <label className="grid gap-2 text-sm font-bold">
          Video file
          <input
            name="file"
            type="file"
            required
            accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"
            className="w-full rounded-2xl border-2 border-dashed border-ink/20 p-5 text-sm font-normal transition-colors file:mr-4 file:rounded-full file:border-0 file:bg-ink file:px-5 file:py-2.5 file:text-sm file:font-bold file:text-white hover:border-ink/50"
          />
          <span className="font-normal text-muted">MP4, MOV or WebM, up to 2 GB and 3 hours long.</span>
        </label>

        <label className="flex items-start gap-3 text-sm">
          <input name="rights" type="checkbox" required className="mt-0.5 size-5 shrink-0 accent-ink" />
          I have the right to upload this lecture and to share it with the students of this course.
        </label>

        <button
          type="submit"
          className="w-fit rounded-full bg-lime px-8 py-3.5 text-[15px] font-bold transition-colors hover:bg-ink hover:text-lime"
        >
          Upload lecture
        </button>
      </form>
    </>
  );
}
