import Link from "next/link";
import { Pills } from "@/components/shell/Pills";
import { getViewer } from "@/lib/auth";
import { citationText } from "@/lib/citations";
import { summarizeQuestions } from "@/lib/insights";
import { createClient } from "@/lib/supabase-server";
import { formatTimestamp } from "@/lib/time";
import { CHIP } from "@/lib/ui";

const QUESTIONS_READ = 1000;
const EXCERPT_CHARS = 180;
const CARD = "rounded-card bg-card p-7 shadow-card";

export default async function InsightsPage({ searchParams }: PageProps<"/insights">) {
  const viewer = await getViewer();
  const heading = (
    <>
      <p className="text-sm font-semibold text-muted">Professor</p>
      <h1 className="mt-1 text-4xl font-extrabold tracking-tight sm:text-5xl">Insights</h1>
    </>
  );
  if (viewer?.role !== "instructor") {
    return (
      <>
        {heading}
        <p className="mt-10 max-w-xl text-muted">
          Insights show professors what students ask about their courses.{" "}
          <Link href={viewer ? "/professor-access" : "/login"} className="font-bold text-ink underline">
            {viewer ? "Request professor access" : "Sign in"}
          </Link>
          .
        </p>
      </>
    );
  }

  const supabase = await createClient(); // acts as the viewer: the questions policy shows owners their own courses only
  const { data: courses, error } = await supabase
    .from("courses")
    .select("id, title, lectures(id, number, title, segments(id))")
    .eq("instructor_id", viewer.id)
    .order("created_at")
    .order("number", { referencedTable: "lectures" });
  if (error) throw new Error(error.message);
  const chosen = (await searchParams).course;
  const course = courses.find((c) => c.id === chosen) ?? courses[0];
  if (!course) {
    return (
      <>
        {heading}
        <p className="mt-10 text-muted">
          You have no courses yet.{" "}
          <Link href="/upload" className="font-bold text-ink underline">
            Create one
          </Link>
          .
        </p>
      </>
    );
  }

  const { data: rows, error: rowsError } = await supabase
    .from("questions")
    .select("text, covered, cited_segment_ids, latency_ms, user_hash, created_at")
    .eq("course_id", course.id)
    .order("created_at", { ascending: false })
    .limit(QUESTIONS_READ);
  if (rowsError) throw new Error(rowsError.message);

  const lectureOfSegment = new Map(course.lectures.flatMap((l) => l.segments.map((s) => [s.id, l.id] as const)));
  const lectureById = new Map(course.lectures.map((l) => [l.id, l]));
  const summary = summarizeQuestions(rows, lectureOfSegment);

  const { data: cited } = summary.topSegments.length
    ? await supabase
        .from("segments")
        .select("id, lecture_id, start_s, end_s, transcript")
        .in("id", summary.topSegments.map((s) => s.segmentId))
    : { data: [] };
  const segmentById = new Map((cited ?? []).map((s) => [s.id, s]));
  const busiest = Math.max(1, ...summary.perLecture.values());

  const stats = [
    { value: String(summary.total), label: "questions asked" },
    { value: String(summary.askers), label: "people asking" },
    { value: summary.total ? `${Math.round((100 * summary.notCovered) / summary.total)}%` : "–", label: "not covered by the lectures" },
    { value: summary.medianLatencyMs === null ? "–" : `${(summary.medianLatencyMs / 1000).toFixed(1)} s`, label: "typical answer time" },
  ];

  return (
    <>
      {heading}
      <div className="mt-8">
        <Pills
          label="Course"
          items={courses.map((c) => ({ key: c.id, text: c.title, href: `/insights?course=${c.id}`, active: c.id === course.id }))}
        />
      </div>

      {summary.total === 0 ? (
        <p className={`mt-5 max-w-3xl text-muted ${CARD}`}>Nobody has asked a question in this course yet.</p>
      ) : (
        <div className="mt-5 grid max-w-5xl gap-5 xl:grid-cols-2">
          <dl className="grid grid-cols-2 gap-5 xl:col-span-2 xl:grid-cols-4">
            {stats.map((stat, i) => (
              <div key={stat.label} className={`rounded-card p-6 ${i === 2 ? "bg-lavender" : "bg-card shadow-card"}`}>
                <dd className="text-5xl leading-none font-extrabold tracking-tighter tabular-nums">{stat.value}</dd>
                <dt className="mt-3 text-sm text-ink/70">{stat.label}</dt>
              </div>
            ))}
          </dl>

          <section aria-labelledby="gaps-heading" className={CARD}>
            <h2 id="gaps-heading" className="text-2xl font-extrabold tracking-tight">
              Gaps
            </h2>
            <p className="mt-1 text-sm text-muted">Recent questions the lectures didn&apos;t answer.</p>
            {summary.gaps.length === 0 ? (
              <p className="mt-5 text-muted">None so far.</p>
            ) : (
              <ul className="mt-5 grid gap-3">
                {summary.gaps.map((gap) => (
                  <li key={gap.created_at + gap.text} className="rounded-2xl border border-dashed border-ink/25 px-4 py-3 text-sm font-semibold">
                    {gap.text}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="lectures-heading" className={CARD}>
            <h2 id="lectures-heading" className="text-2xl font-extrabold tracking-tight">
              Questions per lecture
            </h2>
            <p className="mt-1 text-sm text-muted">Answers that cited each lecture.</p>
            <ul className="mt-5 grid gap-4">
              {course.lectures.map((lecture) => {
                const count = summary.perLecture.get(lecture.id) ?? 0;
                return (
                  <li key={lecture.id}>
                    <p className="flex justify-between gap-4 text-sm font-bold">
                      <span className="truncate">
                        L{lecture.number} · {lecture.title}
                      </span>
                      <span className="tabular-nums">{count}</span>
                    </p>
                    <div className="mt-1.5 h-2.5 rounded-full bg-canvas">
                      <div className="h-full rounded-full bg-lime" style={{ width: `${(100 * count) / busiest}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="moments-heading" className={`xl:col-span-2 ${CARD}`}>
            <h2 id="moments-heading" className="text-2xl font-extrabold tracking-tight">
              Most-cited moments
            </h2>
            <p className="mt-1 text-sm text-muted">The parts of your lectures that answers lean on most.</p>
            <ol className="mt-5 grid gap-4">
              {summary.topSegments.flatMap(({ segmentId, count }) => {
                const segment = segmentById.get(segmentId);
                const lecture = segment && lectureById.get(segment.lecture_id);
                if (!segment || !lecture) return []; // the lecture was deleted since
                return [
                  <li key={segmentId} className="flex gap-4 text-sm leading-snug">
                    <span className="w-12 shrink-0 text-3xl leading-none font-extrabold tabular-nums">{count}×</span>
                    <p className="text-ink/70">
                      <Link href={`/lectures/${lecture.id}?t=${Math.floor(segment.start_s)}`} className={CHIP}>
                        {citationText(lecture.number, segment.start_s)} – {formatTimestamp(segment.end_s)} ↗
                      </Link>{" "}
                      {segment.transcript.length > EXCERPT_CHARS ? `${segment.transcript.slice(0, EXCERPT_CHARS).trimEnd()}…` : segment.transcript}
                    </p>
                  </li>,
                ];
              })}
            </ol>
          </section>
        </div>
      )}
    </>
  );
}
