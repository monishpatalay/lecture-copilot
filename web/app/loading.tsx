/** Shown the moment a link is clicked, while the server builds the page: without it a click looks ignored. */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="motion-safe:animate-pulse">
      <div className="h-10 w-48 rounded-full bg-ink/10 sm:h-12" />
      <div className="mt-4 h-4 w-72 max-w-full rounded-full bg-ink/10" />
      <div className="mt-10 grid gap-4">
        <div className="h-28 rounded-card bg-card" />
        <div className="h-28 rounded-card bg-card" />
        <div className="h-28 rounded-card bg-card" />
      </div>
    </div>
  );
}
