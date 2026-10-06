import { expect, test } from "vitest";
import { describeStatus, validateNewLecture } from "./lectures";

const VALID = {
  courseId: "00000000-0000-0000-0000-000000000001",
  number: 5,
  title: "  Linear Sorting ",
  fileName: "Lecture 5.final.MP4",
  fileSize: 123_403_193,
  rightsConfirmed: true,
};

test("accepts a valid upload and derives the content type from the file extension", () => {
  expect(validateNewLecture(VALID)).toEqual({
    ok: true,
    value: {
      courseId: VALID.courseId,
      number: 5,
      title: "Linear Sorting",
      extension: "mp4",
      contentType: "video/mp4",
    },
  });
  expect(validateNewLecture({ ...VALID, fileName: "talk.mov" })).toMatchObject({ value: { contentType: "video/quicktime" } });
});

test.each([
  ["a missing body", null],
  ["a course id that is not a UUID", { ...VALID, courseId: "1" }],
  ["a lecture number of zero", { ...VALID, number: 0 }],
  ["a fractional lecture number", { ...VALID, number: 1.5 }],
  ["a lecture number sent as text", { ...VALID, number: "5" }],
  ["a blank title", { ...VALID, title: "   " }],
  ["a file that is not a video", { ...VALID, fileName: "notes.pdf" }],
  ["a file with no extension that names an object property", { ...VALID, fileName: "constructor" }],
  ["an empty file", { ...VALID, fileSize: 0 }],
  ["a file over 2 GB", { ...VALID, fileSize: 2 * 1024 ** 3 + 1 }],
  ["no rights confirmation", { ...VALID, rightsConfirmed: false }],
  ["a rights confirmation that is merely truthy", { ...VALID, rightsConfirmed: "yes" }],
])("rejects %s", (_case, body) => {
  expect(validateNewLecture(body).ok).toBe(false);
});

test("describes each state in words, and says when no processor is running", () => {
  const base = { stage: null, progress: 0, workerOnline: true };
  expect(describeStatus({ ...base, status: "queued" })).toBe("Queued");
  expect(describeStatus({ ...base, status: "queued", workerOnline: false })).toBe("Queued · waiting for a processor");
  expect(describeStatus({ ...base, status: "processing", stage: "transcribe", progress: 10 })).toBe(
    "Processing · transcribing · 10%",
  );
  expect(describeStatus({ ...base, status: "processing" })).toBe("Processing · starting · 0%");
  expect(describeStatus({ ...base, status: "failed" })).toBe("Failed");
});
