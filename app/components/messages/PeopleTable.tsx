import type { Conversation } from "@/types/messages";
import { formatNumber, formatShortDate } from "./format";

type PeopleTableProps = {
  conversations: Conversation[];
  selectedKey: string;
  onSelect: (conversationKey: string) => void;
};

export function PeopleTable({ conversations, selectedKey, onSelect }: PeopleTableProps) {
  if (!conversations.length) {
    return <p className="rounded-lg border border-dashed border-border bg-white/60 p-4 text-sm text-muted">No conversations ingested yet.</p>;
  }

  return (
    <div className="border-t border-border">
      <div className="grid min-h-8 grid-cols-[28px_minmax(104px,1fr)_58px_96px_96px_82px] items-center gap-2 border-b border-border py-1.5 text-[11px] font-bold text-soft">
        <span>#</span>
        <span>Person</span>
        <span>Messages</span>
        <span>Balance</span>
        <span>Split</span>
        <span>Last active</span>
      </div>
      {conversations.map((conversation, index) => (
        <PersonRow
          conversation={conversation}
          index={index}
          isSelected={conversation.conversation_key === selectedKey}
          key={conversation.conversation_key}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function PersonRow({
  conversation,
  index,
  isSelected,
  onSelect,
}: {
  conversation: Conversation;
  index: number;
  isSelected: boolean;
  onSelect: (conversationKey: string) => void;
}) {
  const count = Number(conversation.message_count || 0);
  const sent = Number(conversation.sent_count || 0);
  const received = Number(conversation.received_count || 0);
  const sentPct = count ? Math.round((sent / count) * 100) : 0;
  const receivedPct = count ? 100 - sentPct : 0;

  return (
    <button
      className={`grid min-h-9 w-full grid-cols-[28px_minmax(104px,1fr)_58px_96px_96px_82px] items-center gap-2 border-b border-border py-1.5 text-left text-xs text-muted outline-none hover:bg-[#f4f8f7] focus-visible:shadow-[inset_3px_0_0_#0f766e] ${
        isSelected ? "bg-[#f4f8f7]" : ""
      }`}
      onClick={() => onSelect(conversation.conversation_key)}
      type="button"
    >
      <span className="font-bold tabular-nums text-soft">{index + 1}</span>
      <span className="truncate text-[13px] font-bold text-ink">{conversation.display_name || "Unknown"}</span>
      <span>{formatNumber(count)}</span>
      <span className="max-w-[150px]">
        <span className="flex h-[7px] overflow-hidden rounded-full bg-[#eef3f2]">
          <span className="bg-accent" style={{ width: `${sentPct}%` }} />
          <span className="bg-accent-2" style={{ width: `${receivedPct}%` }} />
        </span>
      </span>
      <span className="flex flex-wrap gap-x-2 gap-y-1">
        <span>{sent} you</span>
        <span>{received} them</span>
      </span>
      <span className="truncate">{formatShortDate(conversation.last_active)}</span>
    </button>
  );
}
