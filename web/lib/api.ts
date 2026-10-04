/** The envelope every API route returns: { success, data, error }. */
export const ok = <T>(data: T, status = 200) => Response.json({ success: true, data, error: null }, { status });
export const fail = (status: number, error: string) =>
  Response.json({ success: false, data: null, error }, { status });

export type ApiResponse<T> = { success: true; data: T; error: null } | { success: false; data: null; error: string };

export const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
