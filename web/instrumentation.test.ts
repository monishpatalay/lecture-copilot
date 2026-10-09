import { expect, test, vi } from "vitest";
import { onRequestError } from "./instrumentation";

test("emails the owner once about a server error, without the query string, then stays quiet", async () => {
  // Arrange
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("EMAIL_FROM", "Site <noreply@example.com>");
  vi.stubEnv("HELP_EMAIL_TO", "owner@example.com");
  const send = vi.fn<(url: string, init: { body: string }) => Promise<Response>>(async () => new Response("{}"));
  vi.stubGlobal("fetch", send);
  const request = { path: "/auth/confirm?token_hash=secret", method: "GET", headers: {} };
  const context = { routerKind: "App Router", routePath: "/auth/confirm", routeType: "route" } as Parameters<typeof onRequestError>[2];

  // Act
  await onRequestError(new Error("boom"), request, context);
  await onRequestError(new Error("boom again"), request, context);

  // Assert
  expect(send).toHaveBeenCalledTimes(1);
  const email = JSON.parse(send.mock.calls[0][1].body);
  expect(email.to).toBe("owner@example.com");
  expect(email.subject).toBe("Site error: GET /auth/confirm");
  expect(email.text).toContain("boom");
  expect(email.text).not.toContain("secret");
});
