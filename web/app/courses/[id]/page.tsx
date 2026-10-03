import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { formatTimestamp } from "@/lib/time";

export default async function CoursePage({ params }: PageProps<"/courses/[id]">) {
  const { id } = await params;
  const { data: course } = await supabase
    .from("courses")
    .select("title, lectures(id, number, title, status, stage, progress, duration_s)")
    .eq("id", id)
    .order("number", { referencedTable: "lectures" })
    .maybeSingle();
  if (!course) notFound();

  return (
    <>
      <p className="text-sm font-semibold text-muted">Course</p>
      <h1 className="mt-1 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">{course.title}</h1>

      {course.lectures.length === 0 && (
        <p className="mt-10 rounded-card bg-card p-8 text-muted shadow-card">
          No lectures yet. Process one with the worker CLI and it will show up here.
        </p>
      )}

      <ol className="mt-10 grid gap-3">
        {course.lectures.map((lecture) => {
          const ready = lecture.status === "ready";
          const row = (
            <>
              <span className="w-20 shrink-0 text-5xl leading-none font-extrabold tracking-tighter tabular-nums">
                {String(lecture.number).padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-bold">{lecture.title}</span>
                <span className="text-sm text-muted">
                  {ready && lecture.duration_s != null
                    ? formatTimestamp(lecture.duration_s)
                    : `${lecture.status}${lecture.stage ? ` · ${lecture.stage} ${lecture.progress}%` : ""}`}
                </span>
              </span>
              {ready && (
                <span
                  aria-hidden
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-canvas text-lg transition-colors group-hover:bg-lime"
                >
                  →
                </span>
              )}
            </>
          );
          const rowClass = "flex items-center gap-5 rounded-card bg-card px-7 py-5 shadow-card";
          return (
            <li key={lecture.id}>
              {ready ? (
                <Link
                  href={`/lectures/${lecture.id}`}
                  className={`group ${rowClass} transition-transform hover:-translate-y-0.5`}
                >
                  {row}
                </Link>
              ) : (
                <div className={`${rowClass} opacity-60`}>{row}</div>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
