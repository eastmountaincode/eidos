import type { MessageRun } from "@/types/messages";
import { formatDate, formatNumber } from "./format";

export function SummaryLine({
  conversationCount,
  ingestFailed,
  isIngesting,
  onIngest,
  run,
}: {
  run?: MessageRun | null;
  conversationCount: number;
  ingestFailed: boolean;
  isIngesting: boolean;
  onIngest: () => void;
}) {
  const windowDays = run?.window_days ?? 30;
  const facts = [
    [formatNumber(run?.total_messages), `${windowDays}d messages`],
    [formatNumber(run?.conversation_count ?? conversationCount), `${windowDays}d active conversations`],
    [formatDate(run?.last_message_at), "latest"],
    [formatDate(run?.exported_at), "ingested"],
  ];

  return (
    <section
      aria-label="Messages summary"
      className="flex min-h-9 flex-wrap items-center justify-between gap-x-5 gap-y-1 rounded-lg border border-border bg-white px-3 py-1.5"
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {facts.map(([value, label]) => (
          <div className="flex items-baseline gap-1.5 whitespace-nowrap" key={label}>
            <strong className="text-[13px] leading-none">{value}</strong>
            <span className="text-[11px] text-muted">{label}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        {ingestFailed ? <span className="text-[11px] font-medium text-red-700">Ingest failed</span> : null}
        <button
          className="inline-flex h-6 cursor-pointer items-center gap-1.5 rounded-md border border-accent bg-accent px-2.5 text-[11px] font-bold leading-none text-white disabled:cursor-default disabled:opacity-65"
          disabled={isIngesting}
          onClick={onIngest}
          type="button"
        >
          {isIngesting ? <span className="size-2.5 rounded-full border-2 border-white/45 border-t-white animate-spin" aria-hidden="true" /> : null}
          <span>{isIngesting ? "Ingesting" : "Ingest"}</span>
        </button>
      </div>
    </section>
  );
}
