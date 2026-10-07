import { createHmac } from "node:crypto";

/** Identifies a person without storing who they are. Keyed, so it can't be brute-forced back into an IP or user id. */
export function hashOf(identity: string): string {
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!).update(identity).digest("hex").slice(0, 32);
}

/** The same hash for the same person across requests: their account when signed in, otherwise their IP address. */
export function askerHash(headers: Headers, viewerId: string | undefined): string {
  const ip = headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  return hashOf(viewerId ?? ip);
}
