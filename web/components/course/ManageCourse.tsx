import { SubmitButton } from "@/components/shell/SubmitButton";
import { deleteCourse, deleteLecture, renameCourse, renameLecture } from "@/app/courses/[id]/actions";

type Props = {
  course: { id: string; title: string };
  lectures: { id: string; number: number; title: string; status: string }[];
};

const INPUT = "min-w-0 flex-1 rounded-2xl bg-canvas px-4 py-2.5 text-[15px]";
const SAVE = "rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-lime hover:text-ink";
const DANGER = "rounded-full bg-red-700 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-900";
const DISCLOSE = "w-fit cursor-pointer rounded-full px-4 py-2.5 text-sm font-bold text-red-800 hover:bg-red-50";

/** Rename and delete controls, shown to the course's professor and the admin. Deleting asks twice, without scripts. */
export function ManageCourse({ course, lectures }: Props) {
  return (
    <details className="mt-10 rounded-card bg-card shadow-card">
      <summary className="cursor-pointer px-7 py-5 text-lg font-bold">Manage this course</summary>
      <div className="grid gap-8 border-t border-line px-7 py-6">
        <form action={renameCourse} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="courseId" value={course.id} />
          <label className="grid min-w-0 flex-1 gap-2 text-sm font-bold">
            Course title
            <input name="title" defaultValue={course.title} required maxLength={120} className={INPUT} />
          </label>
          <SubmitButton className={SAVE} pendingText="Saving…">Save</SubmitButton>
        </form>

        {lectures.length > 0 && (
          <section aria-labelledby="manage-lectures">
            <h2 id="manage-lectures" className="text-sm font-bold">
              Lectures
            </h2>
            <ul className="mt-3 grid gap-3">
              {lectures.map((lecture) => (
                <li key={lecture.id} className="flex flex-wrap items-center gap-3">
                  <form action={renameLecture} className="flex min-w-0 flex-1 items-center gap-3">
                    <input type="hidden" name="courseId" value={course.id} />
                    <input type="hidden" name="lectureId" value={lecture.id} />
                    <span className="w-10 shrink-0 text-sm font-bold text-muted tabular-nums">L{lecture.number}</span>
                    <input
                      name="title"
                      aria-label={`Title of lecture ${lecture.number}`}
                      defaultValue={lecture.title}
                      required
                      maxLength={120}
                      className={INPUT}
                    />
                    <SubmitButton className={SAVE} pendingText="Saving…">Save</SubmitButton>
                  </form>
                  {lecture.status === "processing" ? (
                    <span className="px-4 text-sm text-muted">Processing…</span>
                  ) : (
                    <details>
                      <summary className={DISCLOSE}>Delete</summary>
                      <form action={deleteLecture} className="mt-2">
                        <input type="hidden" name="courseId" value={course.id} />
                        <input type="hidden" name="lectureId" value={lecture.id} />
                        <SubmitButton className={DANGER} pendingText="Deleting…">Yes, delete lecture {lecture.number} and its video</SubmitButton>
                      </form>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <details className="border-t border-line pt-6">
          <summary className={DISCLOSE}>Delete this course</summary>
          <form action={deleteCourse} className="mt-3 grid gap-3">
            <input type="hidden" name="courseId" value={course.id} />
            <p className="max-w-xl text-sm text-muted">
              This removes the course, its {lectures.length} {lectures.length === 1 ? "lecture" : "lectures"}, their videos and
              every question students asked. It cannot be undone.
            </p>
            <SubmitButton className={`w-fit ${DANGER}`} pendingText="Deleting the course and its videos…">Yes, delete the whole course</SubmitButton>
          </form>
        </details>
      </div>
    </details>
  );
}
