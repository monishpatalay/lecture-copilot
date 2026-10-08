import { expect, test } from "vitest";
import { validateHelpMessage } from "./help";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}
const good = { name: " Ada ", email: " Ada@Example.com ", topic: "Signing in", message: " The link expired. " };

test("trims a complete message and lowercases the email", () => {
  expect(validateHelpMessage(form(good))).toEqual({ name: "Ada", email: "ada@example.com", topic: "Signing in", message: "The link expired." });
});

test("says which field is wrong", () => {
  expect(validateHelpMessage(form({ ...good, email: "not-an-email" }))).toMatch(/valid email/);
  expect(validateHelpMessage(form({ ...good, topic: "A topic that isn't offered" }))).toBe("Choose what your message is about.");
  expect(validateHelpMessage(form({ ...good, message: "x".repeat(2001) }))).toMatch(/under 2000/);
  expect(validateHelpMessage(form({ ...good, name: "" }))).toMatch(/your name/);
});
