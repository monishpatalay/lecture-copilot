const WORKFLOW = "https://api.github.com/repos/monishpatalay/lecture-copilot/actions/workflows/process.yml/dispatches";
const WAKE_TIMEOUT_MS = 8000; // the upload's response waits on this, and the lecture is queued either way

/**
 * The fast worker: a 16-core machine on Modal (worker/modal_app.py), which processes a 25-minute 1080p
 * lecture in 3 minutes against 7 on GitHub's machine. Needs PROCESSOR_URL and PROCESSOR_TOKEN.
 */
async function wakeModal(): Promise<void> {
  const url = process.env.PROCESSOR_URL;
  const token = process.env.PROCESSOR_TOKEN;
  if (!url || !token) return;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
    signal: AbortSignal.timeout(WAKE_TIMEOUT_MS),
  });
  if (!res.ok) console.error(`could not start the Modal worker: it answered ${res.status}`);
}

/** The free worker: a GitHub Actions run. Needs GITHUB_DISPATCH_TOKEN. */
async function wakeGitHub(): Promise<void> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) return;
  const res = await fetch(WORKFLOW, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    body: JSON.stringify({ ref: "main" }),
    signal: AbortSignal.timeout(WAKE_TIMEOUT_MS),
  });
  if (!res.ok) console.error(`could not start the GitHub worker: GitHub answered ${res.status}`);
}

/**
 * Starts the cloud workers so a newly queued lecture is processed without a laptop. Both are woken: workers
 * claim lectures with SKIP LOCKED, so the first to start takes it and the other finds an empty queue and
 * exits in seconds. Modal usually starts within half a minute, but once took four, and GitHub covers that.
 * With neither configured this does nothing: a local worker, or GitHub's six-hourly schedule, picks it up.
 */
export async function wakeProcessor(): Promise<void> {
  const results = await Promise.allSettled([wakeModal(), wakeGitHub()]);
  for (const result of results) {
    // The lecture is queued either way; the other worker or the scheduled run will find it.
    if (result.status === "rejected") console.error("could not start a processor:", result.reason);
  }
}
