"use client";

import { useRef, useState } from "react";
import { Transcript, type TranscriptLine } from "./Transcript";

export function LectureWorkspace({ videoUrl, lines }: { videoUrl: string; lines: TranscriptLine[] }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  function seek(seconds: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = seconds;
    void video.play();
    video.scrollIntoView({ block: "nearest" }); // the click was deliberate, so bring the player into view
  }

  return (
    <div className="grid gap-5">
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
        className="aspect-video w-full rounded-card bg-ink shadow-card"
      />
      <section aria-labelledby="transcript-heading" className="rounded-card bg-card p-6 shadow-card">
        <h2 id="transcript-heading" className="mb-3 px-3 text-sm font-bold tracking-widest text-muted uppercase">
          Transcript
        </h2>
        <Transcript lines={lines} activeIndex={activeIndex} onSeek={seek} />
      </section>
    </div>
  );
}
