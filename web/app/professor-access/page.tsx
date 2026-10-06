import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { RequestForm } from "./RequestForm";

export default async function ProfessorAccessPage() {
  const viewer = await getViewer();
  return (
    <>
      <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Professor access</h1>
      <section className="mt-10 max-w-xl rounded-card bg-card p-7 shadow-card sm:p-9">
        {!viewer ? (
          <p className="text-muted">
            <Link href="/login" className="font-bold text-ink underline">
              Sign in
            </Link>{" "}
            first, then request access here.
          </p>
        ) : viewer.role === "instructor" ? (
          <p className="text-muted">
            You are a professor.{" "}
            <Link href="/upload" className="font-bold text-ink underline">
              Upload a lecture
            </Link>
            .
          </p>
        ) : viewer.requestStatus === "pending" ? (
          <p role="status" className="rounded-2xl bg-lime px-5 py-4 font-semibold">
            Your request is with the admin. This page and the upload button update once it is approved.
          </p>
        ) : viewer.requestStatus === "declined" ? (
          <p className="text-muted">Your request was declined.</p>
        ) : (
          <>
            <p className="mb-6 text-muted">Professors can create courses and upload lectures. Tell the admin who you are.</p>
            <RequestForm />
          </>
        )}
      </section>
    </>
  );
}
