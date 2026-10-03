import { expect, test } from "vitest";
import { formatTimestamp } from "./time";

test("formats under an hour as mm:ss and floors fractions", () => {
  expect(formatTimestamp(0)).toBe("00:00");
  expect(formatTimestamp(1414.9)).toBe("23:34");
});

test("formats an hour or more as h:mm:ss", () => {
  expect(formatTimestamp(3723)).toBe("1:02:03");
});
