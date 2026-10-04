"use client";

import { useRef, useState, type ReactNode } from "react";
import { formatTimestamp } from "@/lib/time";
import { AskPanel } from "./AskPanel";
import { Transcript, type TranscriptLine } from "./Transcript";

/** The lecture page's interactive part: player, Ask panel and transcript share one video element. */
export function LectureWorkspace({
  courseId,
  lectureId,
  videoUrl,
  lines,
  chapters,
  children,
}: {
  courseId: string;
  lectureId: string;
  videoUrl: string;
  lines: TranscriptLine[];
  chapters: { t_s: number; title: string }[];
  children: ReactNode; // the page header, rendered on the server
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  function seek(seconds: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = seconds;
    void video.play();
    video.scrollIntoView({ block: "nearest" }); // the click was deliberate, so bring the player into view
  }

  // Phones and tablets: header, video, Ask, transcript. Wide screens: Ask becomes a full-height right column.
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_26rem] xl:grid-rows-[auto_auto_1fr] xl:items-start">
      <div className="xl:col-start-1 xl:row-start-1">{children}</div>
      <video
        ref={videoRef}
        src={videoUrl}
        controls
        playsInline
        preload="metadata"
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          // Last line that has started; stays lit through short pauses between lines.
          setActiveIndex(lines.findLastIndex((line) => line.start <= t));
        }}
        className="aspect-video w-full rounded-card bg-ink shadow-card xl:col-start-1 xl:row-start-2"
      />
      <AskPanel
        courseId={courseId}
        lectureId={lectureId}
        onSeek={seek}
        className="xl:sticky xl:top-10 xl:col-start-2 xl:row-span-3 xl:row-start-1 xl:h-[calc(100dvh-5rem)]"
      />
      <section
        aria-labelledby="transcript-heading"
        className="rounded-card bg-card p-6 shadow-card xl:col-start-1 xl:row-start-3"
      >
        {chapters.length > 0 && (
          <nav aria-label="Chapters" className="mb-5 flex flex-wrap gap-2 px-3">
            {chapters.map((chapter) => (
              <button
                key={chapter.t_s}
                type="button"
                onClick={() => seek(chapter.t_s)}
                className="rounded-full bg-canvas px-3.5 py-1.5 text-sm font-semibold transition-colors hover:bg-lavender"
              >
                <span className="mr-2 text-xs text-muted tabular-nums">{formatTimestamp(chapter.t_s)}</span>
                {chapter.title}
              </button>
            ))}
          </nav>
        )}
        <h2 id="transcript-heading" className="mb-3 px-3 text-sm font-bold tracking-widest text-muted uppercase">
          Transcript
        </h2>
        <Transcript lines={lines} activeIndex={activeIndex} onSeek={seek} />
      </section>
    </div>
  );
}
