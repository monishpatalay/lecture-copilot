import Link from "next/link";
import { Pills } from "@/components/shell/Pills";
import { citationText } from "@/lib/citations";
import { createClient } from "@/lib/supabase-server";
import { CHIP } from "@/lib/ui";
import { GenerateButton } from "./GenerateButton";

export default async function ExamPrepPage({ searchParams }: PageProps<"/exam-prep">) {
  const supabase = await createClient();
  const { data: courses, error } = await supabase
    .from("courses")
    .select("id, title, lectures(id, number, title, status, practice)")
    .order("created_at")
    .order("number", { referencedTable: "lectures" });
  if (error) throw new Error(error.message);

  const ready = courses.map((course) => ({ ...course, lectures: course.lectures.filter((l) => l.status === "ready") }));
  const lectures = ready.flatMap((course) => course.lectures);
  const chosen = (await searchParams).lecture;
  const lecture = lectures.find((l) => l.id === chosen) ?? lectures[0];

  // Written by generatePractice as [{question, answer, t_s}]; anything else is ignored.
  const practice = (Array.isArray(lecture?.practice) ? lecture.practice : []).flatMap((p) =>
    p && typeof p === "object" && !Array.isArray(p) && typeof p.question === "string" && typeof p.answer === "string" && typeof p.t_s === "number"
      ? [{ question: p.question, answer: p.answer, t_s: p.t_s }]
      : [],
  );

  return (
    <>
      <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Exam prep</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Practice questions written from each lecture. Try one, then check the answer and watch the moment it comes from.
      </p>
      {!lecture ? (
        <p className="mt-10 text-muted">No lectures are ready yet.</p>
      ) : (
        <>
          <div className="mt-8 grid gap-5">
            {ready
              .filter((course) => course.lectures.length > 0)
              .map((course) => (
                <section key={course.id} aria-label={course.title}>
                  <h2 className="mb-2 text-sm font-semibold text-muted">{course.title}</h2>
                  <Pills
                    label={`Lectures in ${course.title}`}
                    items={course.lectures.map((l) => ({
                      key: l.id,
                      text: `L${l.number} · ${l.title}`,
                      href: `/exam-prep?lecture=${l.id}`,
                      active: l.id === lecture.id,
                    }))}
                  />
                </section>
              ))}
          </div>

          {practice.length === 0 ? (
            <section className="mt-8 max-w-3xl rounded-card bg-card p-7 shadow-card sm:p-9">
              <p className="mb-6 text-muted">
                Nobody has asked for practice questions on <span className="font-bold text-ink">{lecture.title}</span> yet.
              </p>
              <GenerateButton key={lecture.id} lectureId={lecture.id} />
            </section>
          ) : (
            <ol className="mt-8 grid max-w-3xl gap-4">
              {practice.map((item, i) => (
                <li key={item.t_s} className="flex gap-5 rounded-card bg-card p-7 shadow-card">
                  <span className="w-10 shrink-0 text-4xl leading-none font-extrabold text-ink/25 tabular-nums">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-lg leading-snug font-bold">{item.question}</p>
                    <details className="group mt-4">
                      <summary className="w-fit cursor-pointer rounded-full bg-canvas px-4 py-2 text-sm font-bold hover:bg-lavender">
                        <span className="group-open:hidden">Show answer</span>
                        <span className="hidden group-open:inline">Hide answer</span>
                      </summary>
                      <p className="mt-4 leading-relaxed">
                        {item.answer}{" "}
                        <Link href={`/lectures/${lecture.id}?t=${item.t_s}`} className={CHIP}>
                          {citationText(lecture.number, item.t_s)} ↗
                        </Link>
                      </p>
                    </details>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </>
  );
}
