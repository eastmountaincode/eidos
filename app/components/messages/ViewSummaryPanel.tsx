import type { MessageViewSummary } from "@/types/messages";
import { formatDate, formatNumber } from "./format";

type ViewSummaryPanelProps = {
  summary: MessageViewSummary | null;
  windowDays: 7 | 30;
  listLimit: 20 | "all";
  visibleCount: number;
  messageCount: number;
  isLoading: boolean;
  isRequesting: boolean;
  error: string;
  onRequestSummary: () => void;
};

export function ViewSummaryPanel({
  error,
  isLoading,
  isRequesting,
  listLimit,
  messageCount,
  onRequestSummary,
  summary,
  visibleCount,
  windowDays,
}: ViewSummaryPanelProps) {
  const isWorking = isRequesting || summary?.status === "queued" || summary?.status === "running";

  return (
    <div className="grid gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-bold">Current view</h3>
          <p className="text-xs text-muted">
            {windowLabel(windowDays)}, {limitLabel(listLimit).toLowerCase()}.
          </p>
        </div>
        <span className="text-xs text-muted">
          {formatNumber(visibleCount)} {visibleCount === 1 ? "row" : "rows"}
        </span>
      </div>

      <button
        className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-accent bg-accent px-3 text-xs font-bold text-white disabled:opacity-60"
        disabled={isWorking || !visibleCount}
        onClick={onRequestSummary}
        type="button"
      >
        {isWorking ? <span className="size-3 rounded-full border-2 border-white/45 border-t-white animate-spin" aria-hidden="true" /> : null}
        {isWorking ? "Summarizing" : "Summarize current view"}
      </button>

      {error ? <p className="text-xs text-red-700">{error}</p> : null}

      <section className="grid gap-2 border-t border-border pt-3">
        <h4 className="text-xs font-bold">Summary</h4>
        {renderSummaryState(summary, isLoading, messageCount)}
      </section>
    </div>
  );
}

function renderSummaryState(summary: MessageViewSummary | null, isLoading: boolean, messageCount: number) {
  if (isLoading) {
    return <p className="text-xs text-muted">Loading.</p>;
  }

  if (!summary) {
    return <p className="text-xs text-muted">Request a summary of the currently visible message rows.</p>;
  }

  if (summary.status === "failed") {
    return <p className="text-xs text-muted">Summary failed. Check the Mac mini message summary logs for details.</p>;
  }

  if (summary.status !== "completed") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted" role="status" aria-live="polite">
        <span className="size-3 rounded-full border-2 border-border border-t-accent animate-spin" aria-hidden="true" />
        <span>{summary.status === "running" ? "Running" : "Queued"}</span>
      </div>
    );
  }

  return (
    <>
      <SummaryMetadata summary={summary} fallbackMessageCount={messageCount} />
      <p className="text-xs text-muted">{summary.summary || "No summary text."}</p>
      <Themes themes={summary.themes || []} />
    </>
  );
}

function SummaryMetadata({
  fallbackMessageCount,
  summary,
}: {
  summary: MessageViewSummary;
  fallbackMessageCount: number;
}) {
  const items: Array<[string, string]> = [
    ["Generated", summary.generated_at ? formatDate(summary.generated_at) : "unavailable"],
    ["Corpus", `${windowLabel(Number(summary.window_days) === 7 ? 7 : 30)}, ${limitLabel(summary.list_limit === "all" ? "all" : 20).toLowerCase()}`],
    ["Convos", formatNumber(summary.conversation_count || 0)],
    ["Messages", formatNumber(summary.message_count || fallbackMessageCount)],
  ];

  if (summary.source_start_at && summary.source_end_at) {
    items.push(["Range", `${formatDate(summary.source_start_at)} to ${formatDate(summary.source_end_at)}`]);
  }

  return (
    <dl className="grid gap-1 text-[11px] text-muted">
      {items.map(([label, value]) => (
        <div className="grid grid-cols-[58px_1fr] gap-2" key={label}>
          <dt className="font-bold text-soft">{label}</dt>
          <dd className="min-w-0">{value}</dd>
        </div>
      ))}
    </dl>
  );
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

function windowLabel(value: 7 | 30) {
  return value === 7 ? "Last week" : "Last 30 days";
}

function limitLabel(value: 20 | "all" | string) {
  return value === "all" ? "All rows" : "Top 20";
}
