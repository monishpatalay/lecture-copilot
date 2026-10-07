import { SubmitButton } from "@/components/shell/SubmitButton";
import type { PracticeItem } from "@/lib/practice";
import { deletePracticeItem, savePracticeItem } from "./actions";

const FIELD = "w-full rounded-2xl bg-canvas px-4 py-2.5 text-[15px]";
const LETTERS = ["A", "B", "C", "D"];

/** For the course's professor and the admin: correct or remove individual questions. Generated sets can be wrong. */
export function EditPractice({ lectureId, items, reports }: { lectureId: string; items: PracticeItem[]; reports: Map<number, number> }) {
  const reported = items.filter((item) => reports.has(item.t_s)).length;
  return (
    <details className="mt-6 max-w-3xl rounded-card bg-card shadow-card" open={reported > 0}>
      <summary className="cursor-pointer px-7 py-5 text-lg font-bold">
        Edit these questions
        {reported > 0 && (
          <span className="ml-3 rounded-full bg-red-100 px-3 py-1 text-sm text-red-900">
            {reported} reported by students
          </span>
        )}
      </summary>
      <ol className="grid gap-8 border-t border-line px-7 py-6">
        {items.map((item, i) => (
          <li key={item.t_s}>
            <form action={savePracticeItem} className="grid gap-3">
              <input type="hidden" name="lectureId" value={lectureId} />
              <input type="hidden" name="t_s" value={item.t_s} />
              <p className="flex flex-wrap items-center gap-3 text-sm font-bold">
                Question {i + 1}
                {reports.has(item.t_s) && (
                  <span className="rounded-full bg-red-100 px-3 py-0.5 text-xs text-red-900">
                    Reported {reports.get(item.t_s)} {reports.get(item.t_s) === 1 ? "time" : "times"}
                  </span>
                )}
              </p>
              <textarea name="question" aria-label={`Question ${i + 1}`} defaultValue={item.question} required maxLength={300} rows={2} className={FIELD} />
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-xs font-semibold text-muted">Options. Select the correct one.</legend>
                {item.options.map((option, o) => (
                  <label key={o} className="flex items-center gap-3">
                    <input type="radio" name="correct" value={o} defaultChecked={o === item.correct} required aria-label={`Option ${LETTERS[o]} is correct`} className="size-4 accent-ink" />
                    <span className="w-4 text-sm font-extrabold">{LETTERS[o]}</span>
                    <input name={`option${o}`} aria-label={`Option ${LETTERS[o]}`} defaultValue={option} required maxLength={200} className={FIELD} />
                  </label>
                ))}
              </fieldset>
              <textarea name="explanation" aria-label={`Explanation for question ${i + 1}`} defaultValue={item.explanation} required maxLength={700} rows={2} className={FIELD} />
              <div className="flex flex-wrap items-center gap-3">
                <SubmitButton pendingText="Saving…" className="rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-lime hover:text-ink">
                  Save question {i + 1}
                </SubmitButton>
                <SubmitButton
                  formAction={deletePracticeItem}
                  formNoValidate
                  pendingText="Deleting…"
                  className="rounded-full px-4 py-2.5 text-sm font-bold text-red-800 hover:bg-red-50"
                >
                  Delete it
                </SubmitButton>
              </div>
            </form>
          </li>
        ))}
      </ol>
    </details>
  );
}
