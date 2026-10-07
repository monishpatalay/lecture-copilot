import Link from "next/link";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase-server";

export default async function CoursesPage() {
  await connection(); // render per request: courses and lecture counts change without a redeploy
  const supabase = await createClient();
  const { data: courses, error } = await supabase
    .from("courses")
    .select("id, title, lectures(count)")
    .order("created_at");
  if (error) throw new Error(error.message);

  return (
    <>
      <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Courses</h1>
      <ul className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-5">
        {courses.map((course) => {
          const count = course.lectures[0].count;
          return (
            <li key={course.id}>
              <Link
                href={`/courses/${course.id}`}
                className="group flex h-full min-h-56 flex-col justify-between gap-8 rounded-card bg-card p-7 shadow-card transition-transform hover:-translate-y-1"
              >
                <div className="flex items-start justify-between gap-4">
                  <p className="text-sm text-muted">
                    <span className="block text-6xl leading-none font-extrabold tracking-tighter text-ink tabular-nums">{count}</span>
                    {count === 1 ? "lecture" : "lectures"}
                  </p>
                  <span
                    aria-hidden
                    className="grid size-11 shrink-0 place-items-center rounded-full bg-canvas text-lg transition-colors group-hover:bg-lime"
                  >
                    →
                  </span>
                </div>
                <h2 className="text-xl leading-snug font-bold">{course.title}</h2>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
