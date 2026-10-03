import Link from "next/link";
import { notFound } from "next/navigation";
import { LectureWorkspace } from "@/components/lecture/LectureWorkspace";
import type { TranscriptLine } from "@/components/lecture/Transcript";
import { supabase } from "@/lib/supabase";

export default async function LecturePage({ params, searchParams }: PageProps<"/lectures/[id]">) {
  const { id } = await params;
  const { data: lecture } = await supabase
    .from("lectures")
    .select("id, number, title, video_key, course_id, courses(title)")
    .eq("id", id)
    .eq("status", "ready")
    .maybeSingle();
  if (!lecture?.video_key) notFound();

  const r2 = process.env.R2_PUBLIC_BASE_URL;
  const res = await fetch(`${r2}/lectures/${lecture.id}/transcript.json`);
  if (!res.ok) throw new Error(`Could not load transcript (${res.status})`);
  const lines: TranscriptLine[] = await res.json();

  // ?t=<seconds> opens the video at that moment (citations for another lecture link here).
  // The #t= media fragment makes the browser start there, with no script needed.
  const t = Number((await searchParams).t);
  const startAt = Number.isInteger(t) && t > 0 ? `#t=${t}` : "";

  return (
    <LectureWorkspace
      courseId={lecture.course_id}
      lectureId={lecture.id}
      videoUrl={`${r2}/${lecture.video_key}${startAt}`}
      lines={lines}
    >
      <Link href={`/courses/${lecture.course_id}`} className="text-sm font-semibold text-muted hover:text-ink">
        ← {lecture.courses.title}
      </Link>
      <h1 className="mt-2 flex items-baseline gap-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
        <span className="rounded-full bg-lavender px-4 py-1 text-xl tabular-nums">L{lecture.number}</span>
        {lecture.title}
      </h1>
    </LectureWorkspace>
  );
}
