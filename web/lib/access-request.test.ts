import { expect, test } from "vitest";
import { validateAccessRequest } from "./access-request";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

test("trims and returns a complete request", () => {
  expect(validateAccessRequest(form({ name: " Ada ", affiliation: "MIT", note: "Algorithms lectures" }))).toEqual({
    name: "Ada",
    affiliation: "MIT",
    note: "Algorithms lectures",
  });
});

test("names the field that is missing or too long", () => {
  expect(validateAccessRequest(form({ name: "Ada", affiliation: "  ", note: "x" }))).toBe("Fill in where you teach.");
  expect(validateAccessRequest(form({ name: "a".repeat(81), affiliation: "MIT", note: "x" }))).toBe(
    "Keep your name under 80 characters.",
  );
});
