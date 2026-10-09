import { expect, test } from "@playwright/test";

// None of these call a language model: CI has no model keys. The off-topic question is turned away by the
// relevance gate, which runs on search alone.

test("a visitor can go from the courses to a lecture's transcript", async ({ page }) => {
  const blocked: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Content Security Policy")) blocked.push(message.text());
  });

  await page.goto("/");
  await page.getByRole("link", { name: /Introduction to Algorithms/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Introduction to Algorithms");
  await expect(page.getByRole("link", { name: /Hashing/ })).toBeVisible();

  await page.getByRole("link", { name: /Hashing/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hashing");
  await expect(page.getByRole("heading", { name: "Transcript" })).toBeVisible();
  await expect(page.locator("video")).toHaveAttribute("src", /video\.mp4/);
  expect(blocked, "the content security policy must not block anything the page needs").toEqual([]);
});

test("a question the lectures don't cover is refused, with a way to rate the reply", async ({ page }) => {
  await page.goto("/ask");
  await page.getByLabel("Your question").fill("How do I bake sourdough bread?");
  await page.getByRole("button", { name: "Ask" }).click();
  await expect(page.getByText("Not covered in these lectures")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "This answer was not helpful" }).click();
  await expect(page.getByText("Thanks for the feedback.")).toBeVisible();
});

test("exam prep lists the lectures", async ({ page }) => {
  await page.goto("/exam-prep");
  await expect(page.getByRole("link", { name: /L4 · Hashing/ })).toBeVisible();
});

test("pages for professors and the admin stay closed to visitors", async ({ page }) => {
  // No status check: with app/loading.tsx the reply starts streaming (200) before the page decides it is closed.
  await page.goto("/requests");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();

  await page.goto("/insights");
  await expect(page.getByText("Insights show professors what students ask")).toBeVisible();
  await page.goto("/upload");
  await expect(page.getByText("to upload lectures.")).toBeVisible();
});

test("the help page answers common questions and offers a contact form", async ({ page }) => {
  await page.goto("/help");
  await page.getByText("What kind of video can I upload?").click();
  await expect(page.getByText("up to 2 GB and 2 hours long")).toBeVisible();
  await expect(page.getByLabel("What is it about?")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
});

test("responses carry the security headers", async ({ request }) => {
  const headers = (await request.get("/")).headers();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
});
