import Link from "next/link";
import { connection } from "next/server";
import { supabase } from "@/lib/supabase";

export default async function CoursesPage() {
  await connection(); // render per request: courses and lecture counts change without a redeploy
  const { data: courses, error } = await supabase
    .from("courses")
    .select("id, title, lectures(count)")
    .order("created_at");
  if (error) throw new Error(error.message);

  return (
    <>
      <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Courses</h1>
      <ul className="mt-8 grid gap-4 xl:grid-cols-2">
        {courses.map((course) => (
          <li key={course.id}>
            <Link
              href={`/courses/${course.id}`}
              className="group flex items-end justify-between gap-6 rounded-card bg-card p-7 shadow-card transition-transform hover:-translate-y-0.5"
            >
              <h2 className="text-xl leading-snug font-bold">{course.title}</h2>
              <p className="shrink-0 text-right text-sm text-muted">
                <span className="block text-5xl leading-none font-extrabold text-ink">
                  {course.lectures[0].count}
                </span>
                lectures
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
