import Link from "next/link";
import { notFound } from "next/navigation";
import { LectureProgress } from "@/components/lecture/LectureProgress";
import { isWorkerOnline } from "@/lib/lecture-state";
import { supabase } from "@/lib/supabase";
import { formatTimestamp } from "@/lib/time";

const ROW = "flex items-center gap-5 rounded-card bg-card px-7 py-5 shadow-card";
const NUMBER = "w-20 shrink-0 text-5xl leading-none font-extrabold tracking-tighter tabular-nums";

export default async function CoursePage({ params }: PageProps<"/courses/[id]">) {
  const { id } = await params;
  const [{ data: course }, workerOnline] = await Promise.all([
    supabase
      .from("courses")
      .select("title, lectures(id, number, title, status, stage, progress, error, duration_s)")
      .eq("id", id)
      .order("number", { referencedTable: "lectures" })
      .maybeSingle(),
    isWorkerOnline(),
  ]);
  if (!course) notFound();

  return (
    <>
      <p className="text-sm font-semibold text-muted">Course</p>
      <h1 className="mt-1 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">{course.title}</h1>

      {course.lectures.length === 0 && (
        <p className="mt-10 rounded-card bg-card p-8 text-muted shadow-card">
          No lectures yet. Upload one and it will show up here.
        </p>
      )}

      <ol className="mt-10 grid gap-3">
        {course.lectures.map(({ duration_s, ...lecture }) => {
          const number = String(lecture.number).padStart(2, "0");
          return (
            <li key={lecture.id}>
              {lecture.status === "ready" ? (
                <Link
                  href={`/lectures/${lecture.id}`}
                  className={`group ${ROW} transition-transform hover:-translate-y-0.5`}
                >
                  <span className={NUMBER}>{number}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-lg font-bold">{lecture.title}</span>
                    <span className="text-sm text-muted">{formatTimestamp(duration_s ?? 0)}</span>
                  </span>
                  <span
                    aria-hidden
                    className="grid size-11 shrink-0 place-items-center rounded-full bg-canvas text-lg transition-colors group-hover:bg-lime"
                  >
                    →
                  </span>
                </Link>
              ) : (
                // Still on its way (or failed): live status, and the page re-renders once it is ready.
                <div className={ROW}>
                  <span className={`${NUMBER} text-ink/30`}>{number}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-bold">{lecture.title}</p>
                    <LectureProgress
                      lectureId={lecture.id}
                      initial={{ ...lecture, courseId: id, workerOnline }}
                      refreshOnReady
                    />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
