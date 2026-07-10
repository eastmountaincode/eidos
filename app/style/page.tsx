import { ExternalLink, Palette } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { isPortalAuthed } from "@/lib/auth";
import { getStyles } from "@/lib/eidos-api";

export default async function StylePage() {
  if (!(await isPortalAuthed())) redirect("/login");
  const { entries } = await getStyles();

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sidebar text-white"><Palette className="size-5" /></span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Reference library</p>
            <h2 className="text-3xl font-bold tracking-tight">Style</h2>
            <p className="mt-1 text-sm text-muted">Aesthetics, effects, components, and visual ideas captured for later use.</p>
          </div>
        </header>
        {entries.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {entries.map((entry) => (
              <article className="rounded-xl border border-border bg-white p-5 shadow-sm" key={entry.id}>
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-xs font-bold uppercase tracking-wider text-accent-2">{entry.kind || "reference"}</p><h3 className="mt-1 text-lg font-bold leading-snug">{entry.source_text}</h3></div>
                  {entry.url ? <a aria-label={`Open ${entry.source_text}`} className="text-muted hover:text-accent" href={entry.url} rel="noreferrer" target="_blank"><ExternalLink className="size-4" /></a> : null}
                </div>
                {entry.context ? <p className="mt-3 text-sm leading-6 text-ink">{entry.context}</p> : null}
                {entry.notes ? <p className="mt-2 text-sm leading-6 text-muted">{entry.notes}</p> : null}
                {entry.tags.length ? <div className="mt-4 flex flex-wrap gap-1.5">{entry.tags.map((tag) => <span className="rounded-full bg-bg px-2.5 py-1 text-xs font-semibold text-muted" key={tag}>{tag}</span>)}</div> : null}
              </article>
            ))}
          </div>
        ) : <div className="rounded-xl border border-dashed border-border bg-white p-10 text-center text-sm text-muted">No style references captured yet.</div>}
      </div>
    </AppShell>
  );
}
