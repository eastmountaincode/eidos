import type { ConversationDetail as ConversationDetailType, SummaryWindow } from "@/types/messages";
import { formatDate, formatNumber } from "./format";
import { RecentMessages } from "./RecentMessages";
import { SummaryBlock, summaryStatus } from "./SummaryBlock";
import { SummaryControls } from "./SummaryControls";

type ConversationDetailProps = {
  detail: ConversationDetailType | null;
  isLoading: boolean;
  error: string;
  onRequestSummary: (windowType: SummaryWindow) => void;
  isRequestingSummary: boolean;
};

export function ConversationDetail({
  detail,
  error,
  isLoading,
  isRequestingSummary,
  onRequestSummary,
}: ConversationDetailProps) {
  if (isLoading) {
    return <p className="rounded-lg border border-dashed border-border bg-white/60 p-4 text-sm text-muted">Loading conversation...</p>;
  }

  if (error) {
    return <p className="rounded-lg border border-dashed border-border bg-white/60 p-4 text-sm text-red-700">{error}</p>;
  }

  if (!detail) {
    return (
      <div className="grid gap-1">
        <h3 className="text-sm font-bold">Conversation detail</h3>
        <p className="text-sm text-muted">Select a person to view recent messages and request a summary.</p>
      </div>
    );
  }

  const latestSummary = detail.summaries[0] || null;

  return (
    <div className="grid gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-bold">{detail.conversation.display_name}</h3>
          <p className="text-xs text-muted">
            {formatNumber(detail.conversation.message_count)} messages in the current window
          </p>
        </div>
        <span className="text-xs text-muted">{formatDate(detail.conversation.last_active)}</span>
      </div>

      <SummaryControls disabled={isRequestingSummary} onRequestSummary={onRequestSummary} />
      <p className="text-xs text-muted">{latestSummary ? summaryStatus(latestSummary) : "No summary requested yet."}</p>
      <SummaryBlock summary={latestSummary} />
      <RecentMessages messages={detail.recentMessages} />
    </div>
  );
}
