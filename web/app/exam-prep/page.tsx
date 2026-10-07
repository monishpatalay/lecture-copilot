import { Pills } from "@/components/shell/Pills";
import { canManage, getViewer } from "@/lib/auth";
import { readPractice } from "@/lib/practice";
import { admin } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";
import { EditPractice } from "./EditPractice";
import { GenerateButton } from "./GenerateButton";
import { Quiz } from "./Quiz";

export default async function ExamPrepPage({ searchParams }: PageProps<"/exam-prep">) {
  const supabase = await createClient();
  const { data: courses, error } = await supabase
    .from("courses")
    .select("id, title, instructor_id, lectures(id, number, title, status, practice)")
    .order("created_at")
    .order("number", { referencedTable: "lectures" });
  if (error) throw new Error(error.message);

  const ready = courses.map((course) => ({ ...course, lectures: course.lectures.filter((l) => l.status === "ready") }));
  const lectures = ready.flatMap((course) => course.lectures);
  const chosen = (await searchParams).lecture;
  const lecture = lectures.find((l) => l.id === chosen) ?? lectures[0];

  const practice = readPractice(lecture?.practice);
  const owner = ready.find((course) => course.lectures.some((l) => l.id === lecture?.id))?.instructor_id ?? null;
  const mayReplace = practice.length > 0 && canManage(await getViewer(), owner);
  // How many students reported each question, for whoever can fix it. (No public policy on reports.)
  const reports = new Map<number, number>();
  if (mayReplace && lecture) {
    const { data: rows } = await admin.from("practice_reports").select("t_s").eq("lecture_id", lecture.id);
    for (const row of rows ?? []) reports.set(row.t_s, (reports.get(row.t_s) ?? 0) + 1);
  }

  return (
    <>
      <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Exam prep</h1>
      <p className="mt-3 max-w-2xl text-muted">
Multiple-choice questions written from each lecture. Pick an answer to see why it is right and the moment it comes from.
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
            <>
              {/* key: a new lecture, or a new set, starts with a clean score */}
              <Quiz key={lecture.id + practice[0].question} items={practice} lectureId={lecture.id} lectureNumber={lecture.number} />
              {mayReplace && (
                <>
                  <EditPractice lectureId={lecture.id} items={practice} reports={reports} />
                  <div className="mt-6">
                    <GenerateButton key={lecture.id} lectureId={lecture.id} replace />
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
