/** 1414 → "23:34"; 3723 → "1:02:03". The format used in citations like [L4 · 23:34]. */
export function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  const minSec = `${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return hours > 0 ? `${hours}:${minSec}` : minSec;
}
