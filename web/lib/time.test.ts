import { expect, test } from "vitest";
import { formatTimestamp, parseTimestamp } from "./time";

test("formats under an hour as mm:ss and floors fractions", () => {
  expect(formatTimestamp(0)).toBe("00:00");
  expect(formatTimestamp(1414.9)).toBe("23:34");
});

test("formats an hour or more as h:mm:ss", () => {
  expect(formatTimestamp(3723)).toBe("1:02:03");
});

test("parse is the inverse of format and rejects junk", () => {
  expect(parseTimestamp("23:34")).toBe(1414);
  expect(parseTimestamp("1:02:03")).toBe(3723);
  expect(parseTimestamp("83:10")).toBe(4990); // models sometimes keep counting minutes past 59
  expect(parseTimestamp("12")).toBeNull();
  expect(parseTimestamp("1:2")).toBeNull();
});
