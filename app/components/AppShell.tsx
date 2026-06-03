import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-ink md:grid md:grid-cols-[236px_minmax(0,1fr)]">
      <aside className="sticky top-0 z-10 bg-sidebar px-3.5 py-4 text-white md:min-h-screen">
        <div className="flex items-center gap-3 border-b border-white/10 px-1.5 pb-4">
          <div className="grid size-10 place-items-center rounded-lg border border-white/20 font-bold text-teal-200">
            E
          </div>
          <h1 className="text-lg font-bold leading-none">Eidos</h1>
        </div>
        <nav className="mt-5 flex gap-1 overflow-x-auto md:grid">
          <button
            aria-current="page"
            className="flex w-full items-center gap-2 rounded-md bg-white/10 px-2.5 py-2 text-left text-sm font-semibold"
            type="button"
          >
            <span className="grid size-5 place-items-center rounded border border-white/20 text-[11px] text-white/70">
              #
            </span>
            Messages
          </button>
        </nav>
      </aside>
      <main className="min-w-0 p-4 md:p-6">{children}</main>
    </div>
  );
}
