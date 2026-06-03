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
        {summary.status === "failed" ? (
          <p className="text-xs text-muted">{summarizeError(summary.error)}</p>
        ) : (
          <SummaryProgress status={summary.status} />
        )}
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

function SummaryProgress({ status }: { status: "queued" | "running" }) {
  const message = status === "running" ? "Running" : "Queued";

  return (
    <div className="flex items-center gap-2 text-xs text-muted" role="status" aria-live="polite">
      <span className="size-3 rounded-full border-2 border-border border-t-accent animate-spin" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

function summarizeError(error?: string | null) {
  if (!error) return "Summary failed.";

  let text = error;
  try {
    const parsed = JSON.parse(error) as { stderr_tail?: string; error?: string };
    text = parsed.stderr_tail || parsed.error || error;
  } catch {
    // Plain-text failures are already displayable.
  }

  if (text.includes("wss://chatgpt.com") && text.includes("403 Forbidden")) {
    return "Background Codex auth was rejected by ChatGPT. The worker is installed, but automatic summaries need a background-safe model credential.";
  }

  if (text.includes("authorization denied")) {
    return "The Mac mini background worker was denied access while preparing the summary.";
  }

  return "Summary failed. Check the Mac mini message summary logs for details.";
}

function summaryWindowLabel(value: SummaryWindow) {
  if (value === "two_weeks") return "Last 2 weeks";
  if (value === "month") return "Last month";
  if (value === "last_100") return "Last 100 messages";
  return "Last week";
}
