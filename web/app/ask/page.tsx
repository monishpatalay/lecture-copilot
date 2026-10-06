import { AskPanel } from "@/components/lecture/AskPanel";
import { Pills } from "@/components/shell/Pills";
import { createClient } from "@/lib/supabase-server";

export default async function AskPage({ searchParams }: PageProps<"/ask">) {
  const supabase = await createClient();
  const { data: courses, error } = await supabase.from("courses").select("id, title").order("created_at");
  if (error) throw new Error(error.message);
  const chosen = (await searchParams).course;
  const course = courses.find((c) => c.id === chosen) ?? courses[0];

  return (
    <>
      <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Ask</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Ask across every lecture in a course. Each citation opens the lecture at the moment the answer comes from.
      </p>
      {!course ? (
        <p className="mt-10 text-muted">No courses yet.</p>
      ) : (
        <>
          <div className="mt-8">
            <Pills
              label="Course"
              items={courses.map((c) => ({ key: c.id, text: c.title, href: `/ask?course=${c.id}`, active: c.id === course.id }))}
            />
          </div>
          {/* key: switching course starts a fresh conversation */}
          <AskPanel key={course.id} courseId={course.id} className="mt-5 max-w-3xl xl:h-[calc(100dvh-20rem)] xl:min-h-96" />
        </>
      )}
    </>
  );
}
