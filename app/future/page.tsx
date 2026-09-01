import { BellRing, CalendarDays, ExternalLink, MapPin } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { isPortalAuthed } from "@/lib/auth";
import { getFutureEvents } from "@/lib/eidos-api";
import type { FutureEvent } from "@/types/future";

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function dateRange(start: string | null, end: string | null) {
  if (!start) return "Date not announced";
  const first = new Date(`${start}T12:00:00`);
  const last = end ? new Date(`${end}T12:00:00`) : null;
  const format = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (!last || start === end) return format.format(first);
  return `${format.format(first)} – ${format.format(last)}`;
}

function timing(entry: FutureEvent) {
  if (entry.next_start) return { label: "Next edition", value: dateRange(entry.next_start, entry.next_end), live: true };
  return { label: "Last known edition", value: dateRange(entry.last_start, entry.last_end), live: false };
}

export default async function FuturePage() {
  if (!(await isPortalAuthed())) redirect("/login");
  const { entries } = await getFutureEvents();

  return (
    <AppShell>
      <div className="grid gap-5">
        <header className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Keep an eye out</p>
          <h2 className="mt-1 text-[30px] font-bold leading-tight">Future</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">Recurring events worth hearing about before they happen—not after.</p>
        </header>

        {entries.length ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {entries.map((entry) => {
              const when = timing(entry);
              return (
                <article className="group rounded-xl border border-border bg-white p-4 shadow-[0_1px_0_rgba(31,37,37,0.03)]" key={entry.id}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-xl font-bold leading-tight">{entry.name}</h3>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${when.live ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
                          {when.live ? entry.status : "watching"}
                        </span>
                      </div>
                      {entry.description ? <p className="mt-2 text-sm leading-relaxed text-muted">{entry.description}</p> : null}
                    </div>
                    {entry.url ? (
                      <a aria-label={`Open ${entry.name}`} className="grid size-8 shrink-0 place-items-center rounded-full border border-border text-muted transition hover:border-accent hover:text-accent" href={entry.url} rel="noreferrer" target="_blank">
                        <ExternalLink className="size-4" />
                      </a>
                    ) : null}
                  </div>

                  <div className="mt-4 grid gap-2 rounded-lg bg-bg p-3 sm:grid-cols-2">
                    <div className="flex gap-2.5">
                      <CalendarDays className="mt-0.5 size-4 shrink-0 text-accent" />
                      <div><p className="text-[10px] font-bold uppercase tracking-wide text-soft">{when.label}</p><p className="mt-0.5 text-sm font-semibold">{when.value}</p></div>
                    </div>
                    <div className="flex gap-2.5">
                      <BellRing className="mt-0.5 size-4 shrink-0 text-accent-2" />
                      <div><p className="text-[10px] font-bold uppercase tracking-wide text-soft">Start watching</p><p className="mt-0.5 text-sm font-semibold">{entry.watch_month ? monthNames[entry.watch_month - 1] : "Year-round"}</p></div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
                    {entry.location ? <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5" />{entry.location}</span> : null}
                    <span>{entry.cadence}</span>
                    {entry.tags.map((tag) => <span className="rounded-full bg-bg px-2 py-1 font-semibold" key={tag}>{tag}</span>)}
                  </div>
                  {entry.notes ? <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-muted">{entry.notes}</p> : null}
                </article>
              );
            })}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border bg-white/60 p-5 text-sm text-muted">No recurring events are being watched yet.</p>
        )}
      </div>
    </AppShell>
  );
}
