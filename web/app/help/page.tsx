import Link from "next/link";
import type { ReactNode } from "react";
import { getViewer } from "@/lib/auth";
import { HelpForm } from "./HelpForm";

const LINK = "font-bold text-ink underline";

// Each answer states what the app does today. Change one here when the behaviour changes.
const QUESTIONS: { question: string; answer: ReactNode }[] = [
  {
    question: "What kind of video can I upload?",
    answer: (
      <>
        An MP4, MOV or WebM file, up to 2 GB and 3 hours long, with both picture and sound. Any resolution is accepted. Lectures
        play back at up to 720p, so a 1080p or 4K upload is converted down; exporting at 720p before you upload makes
        processing much faster.
      </>
    ),
  },
  {
    question: "How long does it take after I upload?",
    answer: (
      <>
        The upload itself depends on your connection. After that, a one-hour lecture is usually ready in 3 to 10 minutes: about 3
        minutes if the file is already 720p or smaller, longer for 1080p. You can close the page while it works, and you get an
        email when the lecture is ready.
      </>
    ),
  },
  {
    question: "My lecture says it failed, or seems stuck. What do I do?",
    answer: (
      <>
        Open the course page and press <strong>Retry</strong> on that lecture: it carries on from where it stopped. A lecture
        longer than about two hours can pause partway with a message asking you to retry in an hour. If Retry doesn&apos;t help,
        send a message with the form on this page and say which lecture it is.
      </>
    ),
  },
  {
    question: "Who can upload lectures?",
    answer: (
      <>
        Professors. Sign in, open{" "}
        <Link href="/professor-access" className={LINK}>
          Professor access
        </Link>{" "}
        and send a short request. Once it is approved you can create courses and upload to them.
      </>
    ),
  },
  {
    question: "How many questions can I ask?",
    answer: (
      <>
        20 a day in each course without signing in, and 200 a day once you are{" "}
        <Link href="/login" className={LINK}>
          signed in
        </Link>
        .
      </>
    ),
  },
  {
    question: "Why did I get “Not covered in these lectures”?",
    answer: (
      <>
        Answers are written only from what is said in the course&apos;s lectures. When nothing in them answers your question, you
        get that reply instead of a guess. Try wording it the way the lecturer would, or ask about a narrower point.
      </>
    ),
  },
  {
    question: "What are the green time labels in an answer?",
    answer: (
      <>
        Citations. Each one, like <strong>L4 · 31:32</strong>, names the lecture and the moment a sentence comes from. Click it
        and the video jumps there, so you can check the answer against what was actually said.
      </>
    ),
  },
  {
    question: "Can I trust the Exam prep questions?",
    answer: (
      <>
        They are written by an AI model from the lecture and checked by a second pass, but some can still be wrong, especially in
        maths-heavy lectures. Use the report link under a question if one looks wrong; the professor can correct or remove it.
      </>
    ),
  },
  {
    question: "The sign-in email didn’t arrive.",
    answer: (
      <>
        Give it a minute and check your spam folder. Each link works once and expires after an hour, so ask for a new one rather
        than reusing an old email. If it still doesn&apos;t come, send a message with the form on this page, from any address you can read.
      </>
    ),
  },
  {
    question: "How do I rename or delete a lecture or a course?",
    answer: (
      <>
        Open the course and expand <strong>Manage this course</strong> at the bottom of the page. Only the course&apos;s professor
        sees it. Deleting removes the video and everything students asked about it, and can&apos;t be undone.
      </>
    ),
  },
];

export default async function HelpPage() {
  const viewer = await getViewer();
  return (
    <>
      <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Help</h1>
      <p className="mt-3 max-w-2xl text-muted">Answers to common questions. If yours isn&apos;t here, send a message with the form.</p>

      <div className="mt-8 grid max-w-6xl gap-5 xl:grid-cols-[minmax(0,1fr)_26rem] xl:items-start">
        <section aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="sr-only">
            Common questions
          </h2>
          <ul className="grid gap-3">
            {QUESTIONS.map(({ question, answer }) => (
              <li key={question}>
                <details className="group rounded-card bg-card shadow-card">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-7 py-5 text-lg leading-snug font-bold [&::-webkit-details-marker]:hidden">
                    {question}
                    <span
                      aria-hidden
                      className="grid size-9 shrink-0 place-items-center rounded-full bg-canvas text-xl transition-transform group-open:rotate-45 group-open:bg-lime"
                    >
                      +
                    </span>
                  </summary>
                  <p className="px-7 pb-6 leading-relaxed text-ink/80">{answer}</p>
                </details>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="contact-heading" className="rounded-card bg-lavender p-7">
          <h2 id="contact-heading" className="text-2xl font-extrabold tracking-tight">
            Still stuck?
          </h2>
          <p className="mt-1 mb-6 text-sm">Send a message and you&apos;ll get a reply by email.</p>
          <HelpForm email={viewer?.email ?? ""} />
        </section>
      </div>
    </>
  );
}
