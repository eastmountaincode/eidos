import type { ConversationSummary, SummaryWindow } from "@/types/messages";
import { formatDate } from "./format";

export function SummaryBlock({ summary }: { summary: ConversationSummary | null }) {
  if (!summary) {
    return (
      <section className="grid gap-2 border-t border-border pt-3">
        <h4 className="text-xs font-bold">Summary</h4>
        <p className="text-xs text-muted">Request one when this conversation is worth reading in context.</p>
      </section>
    );
  }

  if (summary.status !== "completed") {
    return (
      <section className="grid gap-2 border-t border-border pt-3">
        <h4 className="text-xs font-bold">Summary</h4>
        <p className="text-xs text-muted">
          {summary.status === "failed" ? summary.error || "Summary failed." : "Queued for the Mac mini."}
        </p>
      </section>
    );
  }

  return (
    <section className="grid gap-2 border-t border-border pt-3">
      <h4 className="text-xs font-bold">Summary</h4>
      <p className="text-xs text-muted">{summary.summary || "No summary text."}</p>
      <Themes themes={summary.themes || []} />
      {summary.relationship_notes ? (
        <>
          <h4 className="text-xs font-bold">Relationship notes</h4>
          <p className="text-xs text-muted">{summary.relationship_notes}</p>
        </>
      ) : null}
    </section>
  );
}

export function summaryStatus(summary: ConversationSummary) {
  const label = summaryWindowLabel(summary.window_type);
  if (summary.status === "completed") {
    return `${label} summary generated ${formatDate(summary.generated_at)}.`;
  }
  if (summary.status === "failed") {
    return `${label} summary failed.`;
  }
  return `${label} summary is ${summary.status}.`;
}

function Themes({ themes }: { themes: string[] }) {
  if (!themes.length) return null;
  return (
    <>
      <h4 className="text-xs font-bold">Themes</h4>
      <ul className="grid list-disc gap-1 pl-4 text-xs text-muted">
        {themes.map((theme) => (
          <li key={theme}>{theme}</li>
        ))}
      </ul>
    </>
  );
}

function summaryWindowLabel(value: SummaryWindow) {
  if (value === "two_weeks") return "Last 2 weeks";
  if (value === "month") return "Last month";
  if (value === "last_100") return "Last 100 messages";
  return "Last week";
}
