import { cookies } from "next/headers";

/**
 * For server actions: queues a confirmation that the page shows as a pop-up once the action's response
 * arrives (ToastHost reads and clears it). A cookie, because the action may end in a redirect.
 */
export async function flash(message: string): Promise<void> {
  // Readable by the page's script so it can be cleared after showing; it only ever holds this message.
  (await cookies()).set("flash", `${Date.now()}|${message}`, { path: "/", maxAge: 30, sameSite: "lax" });
}
