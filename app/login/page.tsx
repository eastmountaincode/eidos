import { Suspense } from "react";

function LoginForm({ error }: { error: string | null }) {
  return (
    <main className="grid min-h-screen place-items-center bg-bg p-4 text-ink">
      <section className="w-full max-w-[360px]">
        <h1
          className="mx-auto mb-6 w-full text-center text-[54px] font-bold leading-none text-sidebar"
          style={{ fontFamily: "\"Vaxen Rounded\", \"VaxenRounded\", ui-sans-serif, system-ui, sans-serif" }}
        >
          Eidos
        </h1>
        <div>
          {error ? <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Incorrect password.</p> : null}
          <form className="grid gap-3 rounded-lg border border-border bg-white p-4" action="/api/login" method="post">
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
