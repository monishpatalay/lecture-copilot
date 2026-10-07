import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Page not found</h1>
      <section className="mt-10 max-w-xl rounded-card bg-card p-7 shadow-card sm:p-9">
        <p className="text-muted">There is nothing at this address, or you don&apos;t have access to it.</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-full bg-lime px-8 py-3.5 text-[15px] font-bold transition-colors hover:bg-ink hover:text-lime"
        >
          Back to the courses
        </Link>
      </section>
    </>
  );
}
