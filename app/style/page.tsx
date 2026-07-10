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
                <StylePreview entry={entry} />
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

function StylePreview({ entry }: { entry: Awaited<ReturnType<typeof getStyles>>["entries"][number] }) {
  const tags = new Set(entry.tags.map((tag) => tag.toLowerCase()));
  const isDisplacementText = entry.kind === "text-effect" && tags.has("displacement");
  const imageUrl = entry.preview_url || (entry.kind === "image" && /\.(avif|gif|jpe?g|png|webp)(\?.*)?$/i.test(entry.url || "") ? entry.url : null);

  if (isDisplacementText) {
    const filterId = `style-displacement-${entry.id.replace(/[^a-z0-9_-]/gi, "-")}`;
    return (
      <div className="relative mb-3 grid min-h-32 place-items-center overflow-hidden rounded-md border border-border bg-[#eeeae1] px-4">
        <svg aria-hidden="true" className="absolute size-0">
          <filter id={filterId}>
            <feTurbulence baseFrequency="0.012 0.045" numOctaves="2" seed="7" type="fractalNoise" />
            <feDisplacementMap in="SourceGraphic" scale="7" xChannelSelector="R" yChannelSelector="B" />
          </filter>
        </svg>
        <span className="text-center text-[28px] font-bold tracking-tight text-[#292822]" style={{ filter: `url(#${filterId})` }}>
          Selectable, distorted text
        </span>
      </div>
    );
  }

  if (imageUrl) {
    return (
      <div className="mb-3 overflow-hidden rounded-md border border-border bg-bg">
        {/* Direct URLs are intentional: Style previews may come from arbitrary reference sites. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={`Preview of ${entry.source_text}`} className="h-44 w-full object-cover" loading="lazy" src={imageUrl} />
      </div>
    );
  }

  return null;
}
