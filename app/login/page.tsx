import { Suspense } from "react";

function LoginForm({ error }: { error: string | null }) {
  return (
    <main className="grid min-h-screen place-items-center bg-bg p-4 text-ink">
      <section className="w-full max-w-[360px] rounded-lg border border-border bg-white p-6 shadow-[0_18px_40px_rgba(20,35,34,0.08)]">
        <div className="mb-4 grid size-10 place-items-center rounded-lg border border-border font-bold text-accent">
          E
        </div>
        <h1 className="text-2xl font-bold leading-tight">Eidos Portal</h1>
        <p className="mt-2 text-sm text-muted">Enter the portal password.</p>
        {error ? <p className="mt-2 text-sm text-red-700">Incorrect password.</p> : null}
        <form className="mt-5 grid gap-3" action="/api/login" method="post">
          <label className="grid gap-1.5 text-xs text-muted">
            Password
            <input
              autoFocus
              autoComplete="current-password"
              className="w-full rounded-md border border-border px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              name="password"
              type="password"
            />
          </label>
          <button className="rounded-md bg-accent px-3 py-2 text-sm font-bold text-white" type="submit">
            Enter
          </button>
        </form>
      </section>
    </main>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  return (
    <Suspense>
      <LoginForm error={params.error || null} />
    </Suspense>
  );
}
