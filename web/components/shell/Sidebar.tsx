import Link from "next/link";

const NAV = [
  { label: "Lectures", href: "/" },
  { label: "Ask", href: null },
  { label: "Exam prep", href: null },
  { label: "Insights", href: null },
];

export function Sidebar() {
  return (
    <header className="bg-sidebar text-white lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0">
      <div className="flex items-center gap-6 px-5 py-4 lg:h-full lg:flex-col lg:items-stretch lg:gap-10 lg:px-6 lg:py-8">
        <Link href="/" className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight">
          <span aria-hidden className="grid size-8 place-items-center rounded-full bg-lime text-sm text-ink">
            ▶
          </span>
          Lecture Copilot
        </Link>

        <nav aria-label="Main navigation" className="ml-auto lg:ml-0">
          <ul className="flex gap-1 lg:flex-col">
            {NAV.map(({ label, href }) => (
              <li key={label}>
                {href ? (
                  <Link
                    href={href}
                    className="flex items-center gap-3 rounded-full bg-white/10 px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-white/15"
                  >
                    <span aria-hidden className="size-2 rounded-full bg-lime" />
                    {label}
                  </Link>
                ) : (
                  // Later phases; shown so the layout doesn't shift when they land.
                  <span
                    aria-disabled
                    className="hidden items-center justify-between rounded-full px-4 py-2.5 text-sm font-medium text-white/40 lg:flex"
                  >
                    {label}
                    <span className="text-[10px] font-semibold tracking-widest uppercase">Soon</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </nav>
        {/* Shown to everyone on a developer's machine. Phase 3 limits it to signed-in instructors. */}
        {process.env.NODE_ENV !== "production" && (
          <Link
            href="/upload"
            className="rounded-full bg-lime px-4 py-2.5 text-sm font-bold text-ink transition-transform hover:-translate-y-0.5 lg:mt-auto lg:rounded-card lg:p-5"
          >
            <span className="hidden text-xs font-semibold tracking-widest uppercase opacity-70 lg:block">Instructor</span>
            <span className="lg:mt-1 lg:block lg:text-xl lg:leading-tight lg:font-extrabold">
              Upload<span className="max-lg:hidden"> a lecture</span>
            </span>
            <span aria-hidden className="mt-4 hidden size-10 place-items-center rounded-full bg-ink text-lime lg:grid">
              ↑
            </span>
          </Link>
        )}
      </div>
    </header>
  );
}
