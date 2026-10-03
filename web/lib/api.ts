/** The envelope every API route returns: { success, data, error }. */
export const ok = <T>(data: T, status = 200) => Response.json({ success: true, data, error: null }, { status });
export const fail = (status: number, error: string) =>
  Response.json({ success: false, data: null, error }, { status });

export type ApiResponse<T> = { success: true; data: T; error: null } | { success: false; data: null; error: string };

export const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/**
 * Uploads have no sign-in yet (that is Phase 3), so they only work on a developer's machine.
 * Returns the refusal to send from a production build, or null when uploads are allowed.
 */
export const uploadsDisabled = () =>
  process.env.NODE_ENV === "production" ? fail(403, "Uploads are switched off until sign-in is added.") : null;
