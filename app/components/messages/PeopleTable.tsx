"use client";

import { useMemo, useState } from "react";
import type { Conversation } from "@/types/messages";
import { formatNumber, formatShortDate } from "./format";

type PeopleTableProps = {
  conversations: Conversation[];
  selectedKey: string;
  onSelect: (conversationKey: string) => void;
};

type SortKey = "rank" | "person" | "messages" | "out" | "in" | "balance" | "last_active";
type SortDirection = "asc" | "desc";

const columns: Array<{ key: SortKey; label: string; title: string }> = [
  { key: "rank", label: "#", title: "Sort by rank" },
  { key: "person", label: "Person", title: "Sort by person" },
  { key: "messages", label: "Messages", title: "Sort by message count" },
  { key: "out", label: "Out", title: "Sort by sent messages" },
  { key: "in", label: "In", title: "Sort by received messages" },
  { key: "balance", label: "Balance", title: "Sort by outgoing share" },
  { key: "last_active", label: "Last active", title: "Sort by last active time" },
];

export function PeopleTable({ conversations, selectedKey, onSelect }: PeopleTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: "rank",
    direction: "asc",
  });

  const sortedConversations = useMemo(
    () => sortConversations(conversations, sort.key, sort.direction),
    [conversations, sort],
  );

  if (!conversations.length) {
    return <p className="rounded-lg border border-dashed border-border bg-white/60 p-4 text-sm text-muted">No conversations ingested yet.</p>;
  }

  function changeSort(key: SortKey) {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : defaultDirection(key),
    }));
  }

  return (
    <div className="border-t border-border">
      <div className="grid h-8 grid-cols-[28px_minmax(112px,1fr)_66px_44px_44px_86px_92px] items-center gap-2 border-b border-border text-[11px] font-bold text-soft">
        {columns.map((column) => (
          <HeaderButton
            column={column}
            isActive={sort.key === column.key}
            key={column.key}
            onClick={() => changeSort(column.key)}
            sortDirection={sort.direction}
          />
        ))}
      </div>
      {sortedConversations.map((conversation, index) => (
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

function HeaderButton({
  column,
  isActive,
  onClick,
  sortDirection,
}: {
  column: { key: SortKey; label: string; title: string };
  isActive: boolean;
  onClick: () => void;
  sortDirection: SortDirection;
}) {
  return (
    <button
      aria-label={`${column.title}${isActive ? `, ${sortDirection === "asc" ? "ascending" : "descending"}` : ""}`}
      className="flex min-w-0 cursor-pointer items-center gap-1 text-left font-bold text-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
      onClick={onClick}
      title={column.title}
      type="button"
    >
      <span className="truncate">{column.label}</span>
      <span className={`text-[9px] leading-none ${isActive ? "text-ink" : "text-transparent"}`} aria-hidden="true">
        {sortDirection === "asc" ? "^" : "v"}
      </span>
    </button>
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

  return (
    <button
      className={`grid h-9 w-full cursor-pointer grid-cols-[28px_minmax(112px,1fr)_66px_44px_44px_86px_92px] items-center gap-2 border-b border-border text-left text-xs text-muted outline-none hover:bg-[#f4f8f7] focus-visible:shadow-[inset_3px_0_0_#0f766e] ${
        isSelected ? "bg-[#f4f8f7]" : ""
      }`}
      onClick={() => onSelect(conversation.conversation_key)}
      type="button"
    >
      <span className="font-bold tabular-nums text-soft">{index + 1}</span>
      <span className="truncate text-[13px] font-bold text-ink">{conversation.display_name || "Unknown"}</span>
      <span>{formatNumber(count)}</span>
      <span>{formatNumber(sent)}</span>
      <span>{formatNumber(received)}</span>
      <span className="grid gap-1">
        <span className="tabular-nums">{sentPct}% out</span>
        <span className="relative h-[5px] rounded-full bg-[#edf2f2]" aria-hidden="true">
          <span className="absolute left-1/2 top-[-2px] h-[9px] w-px bg-border" />
          <span
            className="absolute top-[-2px] h-[9px] w-[3px] rounded-full bg-ink"
            style={{ left: `calc(${sentPct}% - 1px)` }}
          />
        </span>
      </span>
      <span className="truncate">{formatShortDate(conversation.last_active)}</span>
    </button>
  );
}

function sortConversations(conversations: Conversation[], key: SortKey, direction: SortDirection) {
  const ranked = conversations.map((conversation, rank) => ({ conversation, rank }));
  const multiplier = direction === "asc" ? 1 : -1;

  return ranked
    .sort((left, right) => {
      const result = compareConversations(left, right, key);
      return result * multiplier;
    })
    .map((item) => item.conversation);
}

function compareConversations(
  left: { conversation: Conversation; rank: number },
  right: { conversation: Conversation; rank: number },
  key: SortKey,
) {
  const leftConversation = left.conversation;
  const rightConversation = right.conversation;

  if (key === "rank") return left.rank - right.rank;
  if (key === "person") return compareStrings(leftConversation.display_name, rightConversation.display_name);
  if (key === "messages") return compareNumbers(leftConversation.message_count, rightConversation.message_count);
  if (key === "out") return compareNumbers(leftConversation.sent_count, rightConversation.sent_count);
  if (key === "in") return compareNumbers(leftConversation.received_count, rightConversation.received_count);
  if (key === "balance") return compareNumbers(outgoingShare(leftConversation), outgoingShare(rightConversation));
  if (key === "last_active") return compareNumbers(timestamp(leftConversation.last_active), timestamp(rightConversation.last_active));

  return left.rank - right.rank;
}

function outgoingShare(conversation: Conversation) {
  const total = Number(conversation.message_count || 0);
  if (!total) return 0;
  return Number(conversation.sent_count || 0) / total;
}

function defaultDirection(key: SortKey): SortDirection {
  return key === "person" || key === "rank" ? "asc" : "desc";
}

function timestamp(value?: string | null) {
  const time = new Date(value || "").getTime();
  return Number.isNaN(time) ? 0 : time;
}

function compareNumbers(left?: number | null, right?: number | null) {
  return Number(left || 0) - Number(right || 0);
}

function compareStrings(left?: string | null, right?: string | null) {
  return String(left || "").localeCompare(String(right || ""), undefined, { sensitivity: "base" });
}
