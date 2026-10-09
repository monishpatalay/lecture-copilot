import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * What the pages may load. Everything is same-origin except lecture media (the public R2 address) and the
 * browser's direct upload to R2's S3 endpoint. Scripts run only with this request's nonce, which Next puts
 * on its own script tags when it sees the policy on the request ('strict-dynamic' covers what they load).
 * Styles still allow inline: the font and component styles are inline and can't carry a nonce.
 * Returns null when the storage addresses aren't set: no policy is better than one that blocks the video.
 */
function contentSecurityPolicy(nonce: string): string | null {
  const media = process.env.R2_PUBLIC_BASE_URL && new URL(process.env.R2_PUBLIC_BASE_URL).origin;
  const account = process.env.R2_ACCOUNT_ID;
  if (!media || !account) return null;
  const dev = process.env.NODE_ENV !== "production"; // the dev server's hot reload needs eval and a websocket
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // blob: lets the upload form read a chosen video's length before sending it
    `media-src 'self' blob: ${media}`,
    `connect-src 'self' https://${account}.r2.cloudflarestorage.com${dev ? " ws:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/**
 * Keeps the sign-in session fresh (Server Components can't write cookies, so the refresh happens here)
 * and gives each request its own script nonce.
 */
export async function proxy(request: NextRequest) {
  const csp = contentSecurityPolicy(Buffer.from(crypto.randomUUID()).toString("base64"));
  // Next reads the policy from the request to find the nonce, so it goes on the request and the response.
  if (csp) request.headers.set("Content-Security-Policy", csp);
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  // Nothing may run between creating the client and this call (Supabase's guidance), or sessions drop at random.
  await supabase.auth.getClaims();
  if (csp) response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Everything except static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
