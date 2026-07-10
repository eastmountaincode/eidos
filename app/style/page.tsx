import { ExternalLink } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { isPortalAuthed } from "@/lib/auth";
import { getStyles } from "@/lib/eidos-api";

export default async function StylePage() {
  if (!(await isPortalAuthed())) redirect("/login");
  const { entries } = await getStyles();

  return (
    <AppShell>
      <div className="grid gap-4">
        <header>
          <h2 className="text-[26px] font-bold leading-tight">Style</h2>
        </header>
        {entries.length ? (
          <div className="grid gap-2 lg:grid-cols-2">
            {entries.map((entry) => (
              <article className="rounded-lg border border-border bg-white p-3" key={entry.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-bold leading-snug">{entry.source_text}</h3>
                    <p className="mt-0.5 text-xs text-muted">{entry.kind || "reference"}</p>
                  </div>
                  {entry.url ? <a aria-label={`Open ${entry.source_text}`} className="text-muted hover:text-accent" href={entry.url} rel="noreferrer" target="_blank"><ExternalLink className="size-4" /></a> : null}
                </div>
                {entry.context ? <p className="mt-3 text-sm leading-snug text-muted">{entry.context}</p> : null}
                {entry.notes ? <p className="mt-2 text-sm leading-snug text-muted">{entry.notes}</p> : null}
                {entry.tags.length ? <div className="mt-3 flex flex-wrap gap-1.5">{entry.tags.map((tag) => <span className="rounded-full bg-bg px-2 py-1 text-[11px] font-bold text-muted" key={tag}>{tag}</span>)}</div> : null}
              </article>
            ))}
          </div>
        ) : <p className="rounded-lg border border-dashed border-border bg-white/60 p-4 text-sm text-muted">No style references captured yet.</p>}
      </div>
    </AppShell>
  );
}
