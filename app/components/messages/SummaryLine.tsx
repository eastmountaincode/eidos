import type { MessageRun } from "@/types/messages";
import { formatDate, formatNumber } from "./format";

export function SummaryLine({ run, conversationCount }: { run?: MessageRun | null; conversationCount: number }) {
  const windowDays = run?.window_days ?? 30;
  const facts = [
    [formatNumber(run?.total_messages), `${windowDays}d messages`],
    [formatNumber(run?.conversation_count ?? conversationCount), `${windowDays}d active conversations`],
    [formatDate(run?.last_message_at), "latest"],
    [formatDate(run?.exported_at), "ingested"],
    ["not scheduled", "next ingest"],
  ];

  return (
    <section
      aria-label="Messages summary"
      className="flex min-h-9 flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border bg-white px-3 py-2"
    >
      {facts.map(([value, label]) => (
        <div className="flex items-baseline gap-1.5 whitespace-nowrap" key={label}>
          <strong className="text-[13px] leading-none">{value}</strong>
          <span className="text-[11px] text-muted">{label}</span>
        </div>
      ))}
    </section>
  );
}
