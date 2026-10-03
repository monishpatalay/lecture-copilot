import { connection } from "next/server";
import { UploadForm } from "@/components/upload/UploadForm";
import { supabase } from "@/lib/supabase";

const STEPS = [
  ["Upload", "The video goes straight from your browser to storage."],
  ["Processing", "It is transcribed, its slides are read, and it is split into searchable segments. Expect about 8 minutes per hour of video."],
  ["Ready", "Students can ask questions, and every answer points at the moment it comes from."],
];

export default async function UploadPage() {
  await connection(); // the course list changes without a redeploy
  const { data: courses, error } = await supabase.from("courses").select("id, title").order("created_at");
  if (error) throw new Error(error.message);
  const disabled = process.env.NODE_ENV === "production"; // no sign-in yet, see lib/api.ts

  return (
    <>
      <p className="text-sm font-semibold text-muted">Instructor</p>
      <h1 className="mt-1 text-4xl font-extrabold tracking-tight sm:text-5xl">Upload a lecture</h1>

      <div className="mt-10 grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <section className="rounded-card bg-card p-7 shadow-card sm:p-9">
          {disabled ? (
            <p className="text-muted">Uploads are switched off here until sign-in is added.</p>
          ) : courses.length === 0 ? (
            <p className="text-muted">There are no courses to upload to yet.</p>
          ) : (
            <UploadForm courses={courses} />
          )}
        </section>

        <aside aria-labelledby="next-heading" className="rounded-card bg-lavender p-7">
          <h2 id="next-heading" className="text-sm font-bold tracking-widest uppercase">
            What happens next
          </h2>
          <ol className="mt-5 grid gap-5">
            {STEPS.map(([name, detail], i) => (
              <li key={name} className="flex gap-4">
                <span className="text-4xl leading-none font-extrabold tabular-nums">{i + 1}</span>
                <p className="text-sm leading-relaxed">
                  <span className="block text-base font-bold">{name}</span>
                  {detail}
                </p>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </>
  );
}
