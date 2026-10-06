const WORKFLOW = "https://api.github.com/repos/monishpatalay/lecture-copilot/actions/workflows/process.yml/dispatches";

/**
 * Starts the cloud worker (a GitHub Actions run) so a newly queued lecture is processed without a laptop.
 * Without GITHUB_DISPATCH_TOKEN this does nothing: a local worker, or the workflow's schedule, picks it up.
 */
export async function wakeProcessor(): Promise<void> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) return;
  try {
    const res = await fetch(WORKFLOW, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
      body: JSON.stringify({ ref: "main" }),
    });
    if (!res.ok) console.error(`could not start the processor: GitHub answered ${res.status}`);
  } catch (error) {
    // The lecture is queued either way; the scheduled run will find it.
    console.error("could not start the processor:", error);
  }
}
