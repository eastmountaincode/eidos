import type { AgentCapability, CapabilityKind } from "@/types/capabilities";

type CapabilitiesPageProps = {
  capabilities: AgentCapability[];
};

const labels: Record<CapabilityKind, string> = {
  tool: "Tools",
  skill: "Skills",
};

export function CapabilitiesPage({ capabilities }: CapabilitiesPageProps) {
  const tools = capabilities.filter((capability) => capability.kind === "tool");
  const skills = capabilities.filter((capability) => capability.kind === "skill");

  return (
    <div className="grid gap-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[26px] font-bold leading-tight">Tools & Skills</h2>
          <p className="mt-1 text-sm text-muted">D1-backed registry of what Eidos can access and what it knows how to do.</p>
        </div>
        <div className="flex gap-2 text-[11px] font-bold">
          <span className="rounded-full bg-white px-2.5 py-1 text-muted">{tools.length} tools</span>
          <span className="rounded-full bg-white px-2.5 py-1 text-muted">{skills.length} skills</span>
        </div>
      </header>

      <CapabilitySection capabilities={tools} kind="tool" />
      <CapabilitySection capabilities={skills} kind="skill" />
    </div>
  );
}

function CapabilitySection({ capabilities, kind }: { capabilities: AgentCapability[]; kind: CapabilityKind }) {
  return (
    <section className="grid gap-2">
      <div className="flex items-baseline justify-between border-b border-border pb-2">
        <h3 className="text-sm font-bold">{labels[kind]}</h3>
        <span className="text-[11px] text-muted">{capabilities.length} registered</span>
      </div>
      {capabilities.length ? (
        <div className="grid gap-2 lg:grid-cols-2">
          {capabilities.map((capability) => (
            <CapabilityCard capability={capability} key={capability.id} />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border bg-white/60 p-4 text-sm text-muted">No {labels[kind].toLowerCase()} registered.</p>
      )}
    </section>
  );
}

function CapabilityCard({ capability }: { capability: AgentCapability }) {
  return (
    <article className="grid gap-3 rounded-lg border border-border bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="truncate text-[15px] font-bold">{capability.name}</h4>
          <p className="mt-0.5 text-xs text-muted">{capability.category || capability.kind}</p>
        </div>
        <StatusBadge status={capability.status} />
      </div>

      <p className="text-sm leading-snug text-muted">{capability.summary}</p>

      <dl className="grid gap-1.5 text-xs">
        {capability.updated_at ? <MetaRow label="Updated" value={formatUpdatedAt(capability.updated_at)} /> : null}
        {capability.data_source ? <MetaRow label="Source" value={capability.data_source} /> : null}
        {capability.invocation ? <MetaRow code label="Invocation" value={capability.invocation} /> : null}
        {capability.notes ? <MetaRow label="Notes" value={capability.notes} /> : null}
      </dl>
    </article>
  );
}

function formatUpdatedAt(value: string) {
  const normalized = /^\d{4}-\d{2}-\d{2} /.test(value) ? `${value.replace(" ", "T")}Z` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function MetaRow({ code = false, label, value }: { code?: boolean; label: string; value: string }) {
  return (
    <div className="grid grid-cols-[76px_1fr] gap-2">
      <dt className="font-bold text-soft">{label}</dt>
      <dd className={`min-w-0 text-muted ${code ? "font-mono text-[11px]" : ""}`}>{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isActive = status === "active";

  return (
    <span
      className={`rounded-full px-2 py-1 text-[11px] font-bold ${
        isActive ? "bg-[#dff3e8] text-[#166534]" : "bg-[#edf2f2] text-muted"
      }`}
    >
      {status}
    </span>
  );
}
