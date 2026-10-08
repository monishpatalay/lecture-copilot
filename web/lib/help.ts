/** What the help form's "What is it about?" menu offers. The chosen one goes in the email's subject. */
export const TOPICS = [
  "Uploading a lecture",
  "A lecture that is stuck or failed",
  "Signing in",
  "An answer or citation that looks wrong",
  "Exam prep questions",
  "Professor access",
  "Something else",
] as const;

export type HelpMessage = { name: string; email: string; topic: (typeof TOPICS)[number]; message: string };

const MAX_NAME_CHARS = 80;
const MAX_EMAIL_CHARS = 254;
export const MAX_MESSAGE_CHARS = 2000;

/** The cleaned message, or what to tell the person who filled in the form. */
export function validateHelpMessage(form: FormData): HelpMessage | string {
  const text = (key: string) => {
    const raw = form.get(key);
    return typeof raw === "string" ? raw.trim() : "";
  };
  const name = text("name");
  if (!name || name.length > MAX_NAME_CHARS) return `Enter your name (up to ${MAX_NAME_CHARS} characters).`;
  const email = text("email").toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > MAX_EMAIL_CHARS) return "Enter a valid email address, so there is somewhere to reply.";
  const topic = TOPICS.find((t) => t === text("topic"));
  if (!topic) return "Choose what your message is about.";
  const message = text("message");
  if (!message) return "Write your message.";
  if (message.length > MAX_MESSAGE_CHARS) return `Keep your message under ${MAX_MESSAGE_CHARS} characters.`;
  return { name, email, topic, message };
}
