import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { admin } from "@/lib/supabase-admin";
import { NavLinks } from "./NavLinks";
import { SignInNudge } from "./SignInNudge";

export async function Sidebar() {
  const viewer = await getViewer();
  const { count: pendingRequests } = viewer?.isAdmin
    ? await admin.from("profiles").select("id", { count: "exact", head: true }).eq("request_status", "pending")
    : { count: null };
  return (
    <header className="group/sidebar bg-sidebar text-white lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:has-[.sidebar-toggle:checked]:w-14">
      {/* A checkbox, so minimizing needs no client JavaScript; the layout keeps it across page changes. */}
      <label className="absolute top-8 right-3 hidden size-8 cursor-pointer place-items-center rounded-full bg-white/10 text-sm font-bold hover:bg-white/20 has-focus-visible:outline-2 has-focus-visible:outline-lime lg:grid">
        <input type="checkbox" aria-label="Minimize sidebar" className="sidebar-toggle peer sr-only" />
        <span aria-hidden className="peer-checked:hidden">
          «
        </span>
        <span aria-hidden className="hidden peer-checked:inline">
          »
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4 lg:h-full lg:flex-col lg:flex-nowrap lg:items-stretch lg:gap-10 lg:px-6 lg:py-8 lg:group-has-[.sidebar-toggle:checked]/sidebar:hidden">
        <Link href="/" className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight">
          <span aria-hidden className="grid size-8 place-items-center rounded-full bg-lime text-sm text-ink">
            ▶
          </span>
          Lecture Copilot
        </Link>

        <nav aria-label="Main navigation" className="ml-auto lg:ml-0">
          <NavLinks isProfessor={viewer?.role === "instructor"} />
        </nav>

        <div className="flex items-center gap-3 lg:mt-auto lg:flex-col lg:items-stretch lg:gap-4">
          {viewer?.role === "instructor" && (
            <Link
              href="/upload"
              className="rounded-full bg-lime px-4 py-2.5 text-sm font-bold text-ink transition-transform hover:-translate-y-0.5 lg:rounded-card lg:p-5"
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
          {viewer?.isAdmin && (
            <Link
              href="/requests"
              className="flex items-center justify-between gap-3 rounded-full bg-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/15"
            >
              Requests
              {!!pendingRequests && (
                <span className="rounded-full bg-lime px-2 py-0.5 text-xs font-bold text-ink">{pendingRequests}</span>
              )}
            </Link>
          )}
          {viewer?.role === "student" && (
            <Link
              href="/professor-access"
              className="rounded-full bg-white/10 px-4 py-2.5 text-center text-sm font-semibold hover:bg-white/15"
            >
              {viewer.requestStatus === "pending" ? "Request pending" : "Request professor access"}
            </Link>
          )}
          {viewer ? (
            <form action="/auth/signout" method="post" className="flex items-center gap-3 text-sm lg:justify-between">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                    viewer.role === "instructor" ? "bg-lime text-ink" : "bg-lavender text-ink"
                  }`}
                >
                  {viewer.role === "instructor" ? "Professor" : "User"}
                </span>
                <span className="hidden truncate text-white/60 lg:block" title={viewer.email}>
                  {viewer.email}
                </span>
              </span>
              <button type="submit" className="shrink-0 rounded-full px-3 py-1.5 font-semibold text-white/80 hover:bg-white/10">
                Sign out
              </button>
            </form>
          ) : (
            <>
              <Link href="/login" className="rounded-full bg-white/10 px-4 py-2.5 text-center text-sm font-semibold hover:bg-white/15">
                Sign in
              </Link>
              <SignInNudge />
            </>
          )}
        </div>
      </div>
    </header>
  );
}
