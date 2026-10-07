import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/shell/SubmitButton";
import { getViewer } from "@/lib/auth";
import { admin } from "@/lib/supabase-admin";
import { decideRequest } from "../professor-access/actions";

export default async function RequestsPage() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) notFound();

  const { data: pending, error } = await admin
    .from("profiles")
    .select("id, display_name, request_affiliation, request_note, requested_at")
    .eq("request_status", "pending")
    .order("requested_at");
  if (error) throw new Error(`could not load access requests: ${error.message}`);

  // Emails live in auth.users, which only the service role can read.
  const requests = await Promise.all(
    pending.map(async (request) => ({
      ...request,
      email: (await admin.auth.admin.getUserById(request.id)).data.user?.email ?? "unknown email",
    })),
  );

  return (
    <>
      <p className="text-sm font-semibold text-muted">Admin</p>
      <h1 className="mt-1 text-4xl font-extrabold tracking-tight sm:text-5xl">Professor requests</h1>
      {requests.length === 0 ? (
        <p className="mt-10 text-muted">No requests waiting.</p>
      ) : (
        <ul className="mt-10 grid max-w-3xl gap-5">
          {requests.map((request) => (
            <li key={request.id} className="rounded-card bg-card p-7 shadow-card">
              <h2 className="text-xl font-extrabold">{request.display_name}</h2>
              <p className="mt-1 text-sm text-muted">
                {request.email} · {request.request_affiliation}
                {request.requested_at && ` · ${new Date(request.requested_at).toLocaleDateString("en-US", { dateStyle: "medium" })}`}
              </p>
              <p className="mt-4 whitespace-pre-line">{request.request_note}</p>
              <form action={decideRequest} className="mt-6 flex gap-3">
                <input type="hidden" name="id" value={request.id} />
                <SubmitButton
                  name="decision"
                  value="approve"
                  pendingText="Saving…"
                  className="rounded-full bg-lime px-6 py-2.5 text-sm font-bold transition-colors hover:bg-ink hover:text-lime"
                >
                  Approve
                </SubmitButton>
                <SubmitButton
                  name="decision"
                  value="decline"
                  pendingText="Saving…"
                  className="rounded-full bg-canvas px-6 py-2.5 text-sm font-bold transition-colors hover:bg-ink hover:text-white"
                >
                  Decline
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
