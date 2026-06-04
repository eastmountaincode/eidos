import { Suspense } from "react";

function LoginForm({ error }: { error: string | null }) {
  return (
    <main className="min-h-screen bg-bg text-ink md:grid md:grid-cols-[236px_minmax(0,1fr)]">
      <aside className="bg-sidebar px-3.5 py-4 text-white md:min-h-screen">
        <div className="border-b border-white/10 px-2.5 pb-4 pt-1">
          <h1
            className="block w-full whitespace-nowrap text-[40px] font-bold leading-[1.05]"
            style={{ fontFamily: "\"Vaxen Rounded\", \"VaxenRounded\", ui-sans-serif, system-ui, sans-serif" }}
          >
            Eidos
          </h1>
        </div>
      </aside>

      <section className="grid min-h-[calc(100vh-96px)] place-items-center p-4 md:min-h-screen md:p-6">
        <div className="w-full max-w-[360px]">
          <h2 className="text-[26px] font-bold leading-tight">Portal Login</h2>
          <p className="mt-1 text-sm text-muted">Enter the portal password.</p>
          {error ? <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Incorrect password.</p> : null}
          <form className="mt-5 grid gap-3 rounded-lg border border-border bg-white p-4" action="/api/login" method="post">
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
        </div>
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
