export type AccessRequest = { name: string; affiliation: string; note: string };

const FIELDS: { key: keyof AccessRequest; label: string; max: number }[] = [
  { key: "name", label: "your name", max: 80 },
  { key: "affiliation", label: "where you teach", max: 120 },
  { key: "note", label: "what you plan to upload", max: 500 },
];

/** The cleaned request, or the message to show the person who filled in the form. */
export function validateAccessRequest(form: FormData): AccessRequest | string {
  const request = { name: "", affiliation: "", note: "" };
  for (const { key, label, max } of FIELDS) {
    const raw = form.get(key);
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) return `Fill in ${label}.`;
    if (value.length > max) return `Keep ${label} under ${max} characters.`;
    request[key] = value;
  }
  return request;
}
