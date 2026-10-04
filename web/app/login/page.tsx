import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const expired = (await searchParams).error !== undefined;
  return (
    <>
      <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Sign in</h1>
      <section className="mt-10 max-w-xl rounded-card bg-card p-7 shadow-card sm:p-9">
        {expired && (
          <p role="alert" className="mb-5 rounded-2xl bg-red-50 px-5 py-3 text-sm font-semibold text-red-900">
            That sign-in link has expired or was already used. Ask for a new one.
          </p>
        )}
        <p className="mb-6 text-muted">No password. Enter your email and we&apos;ll send you a link that signs you in.</p>
        <LoginForm />
      </section>
    </>
  );
}
