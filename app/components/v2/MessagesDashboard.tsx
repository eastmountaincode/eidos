"use client";

import { ArrowLeft, ChevronRight, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  Conversation,
  ConversationDetail,
  MessageViewSummary,
  MessagesOverview,
  SummaryWindow,
} from "@/types/messages";

type WindowDays = 7 | 30;
type SortBy = "messages" | "recent" | "name";

const number = new Intl.NumberFormat();
const summaryWindows: { value: SummaryWindow; label: string }[] = [
  { value: "week", label: "Last week" },
  { value: "two_weeks", label: "Last 2 weeks" },
  { value: "month", label: "Last month" },
  { value: "last_100", label: "Last 100 messages" },
];

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<T>;
}

function overviewUrl(days: WindowDays) {
  return `/api/messages?window_days=${days}`;
}

function detailUrl(key: string) {
  return `/api/message-detail?conversation_key=${encodeURIComponent(key)}`;
}

function date(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function time(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function timestamp(value?: string | null) {
  const parsed = new Date(value || "").getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function name(conversation: Conversation) {
  return conversation.display_name || conversation.handle || "Unknown";
}

function share(sent: number, total: number) {
  return total ? Math.round((sent / total) * 100) : 0;
}

export function MessagesDashboard() {
  const [windowDays, setWindowDays] = useState<WindowDays>(30);
  const [retryCount, setRetryCount] = useState(0);
  const [sortBy, setSortBy] = useState<SortBy>("messages");
  const [query, setQuery] = useState("");
  const [overview, setOverview] = useState<MessagesOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [summaryWindow, setSummaryWindow] = useState<SummaryWindow>("month");
  const [requestingSummary, setRequestingSummary] = useState(false);
  const [viewSummary, setViewSummary] = useState<MessageViewSummary | null>(
    null,
  );
  const [requestingViewSummary, setRequestingViewSummary] = useState(false);
  const [summaryError, setSummaryError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    readJson<MessagesOverview>(overviewUrl(windowDays))
      .then((value) => {
        if (!cancelled) setOverview(value);
      })
      .catch((reason) => {
        if (!cancelled) setError(String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [retryCount, windowDays]);

  useEffect(() => {
    if (!selectedKey) return;
    let cancelled = false;
    setDetail(null);
    setDetailLoading(true);
    setDetailError("");
    readJson<ConversationDetail>(detailUrl(selectedKey))
      .then((value) => {
        if (!cancelled) setDetail(value);
      })
      .catch((reason) => {
        if (!cancelled) setDetailError(String(reason));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedKey]);

  const ingestStatus = overview?.latestIngestRequest?.status;
  useEffect(() => {
    if (!syncing && ingestStatus !== "queued" && ingestStatus !== "running")
      return;
    const interval = window.setInterval(() => {
      readJson<MessagesOverview>(overviewUrl(windowDays))
        .then((value) => {
          setOverview(value);
          if (
            value.latestIngestRequest?.status !== "queued" &&
            value.latestIngestRequest?.status !== "running"
          ) {
            setSyncing(false);
          }
        })
        .catch((reason) => {
          setError(String(reason));
          setSyncing(false);
        });
    }, 3000);
    return () => window.clearInterval(interval);
  }, [ingestStatus, syncing, windowDays]);

  const detailSummaryStatus = detail?.summaries?.[0]?.status;
  useEffect(() => {
    if (
      !selectedKey ||
      (detailSummaryStatus !== "queued" && detailSummaryStatus !== "running")
    )
      return;
    const interval = window.setInterval(() => {
      readJson<ConversationDetail>(detailUrl(selectedKey))
        .then(setDetail)
        .catch((reason) => setDetailError(String(reason)));
    }, 3000);
    return () => window.clearInterval(interval);
  }, [detailSummaryStatus, selectedKey]);

  const viewSummaryStatus = viewSummary?.status;
  const conversations = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const rows = (overview?.topConversations || []).filter(
      (conversation) =>
        !needle ||
        name(conversation).toLocaleLowerCase().includes(needle) ||
        (conversation.handle || "").toLocaleLowerCase().includes(needle),
    );
    return rows.sort((a, b) => {
      if (sortBy === "name") return name(a).localeCompare(name(b));
      if (sortBy === "recent")
        return timestamp(b.last_active) - timestamp(a.last_active);
      return Number(b.message_count || 0) - Number(a.message_count || 0);
    });
  }, [overview, query, sortBy]);
  const conversationKeys = conversations.map(
    (conversation) => conversation.conversation_key,
  );
  const keySignature = conversationKeys.join("\n");
  const visibleTotal = conversations.reduce(
    (sum, item) => sum + Number(item.message_count || 0),
    0,
  );
  const visibleSent = conversations.reduce(
    (sum, item) => sum + Number(item.sent_count || 0),
    0,
  );
  const visibleReceived = conversations.reduce(
    (sum, item) => sum + Number(item.received_count || 0),
    0,
  );

  useEffect(() => {
    setViewSummary(null);
    setSummaryError("");
  }, [keySignature, windowDays]);

  useEffect(() => {
    if (viewSummaryStatus !== "queued" && viewSummaryStatus !== "running")
      return;
    const interval = window.setInterval(() => {
      const keys = keySignature ? keySignature.split("\n") : [];
      const params = new URLSearchParams({
        window_days: String(windowDays),
        list_limit: "all",
      });
      keys.forEach((key) => params.append("conversation_key", key));
      readJson<{ summary: MessageViewSummary | null }>(
        `/api/message-view-summary?${params}`,
      )
        .then(({ summary }) => {
          setViewSummary(summary);
          if (
            !summary ||
            summary.status === "completed" ||
            summary.status === "failed"
          )
            setRequestingViewSummary(false);
        })
        .catch((reason) => {
          setSummaryError(String(reason));
          setRequestingViewSummary(false);
        });
    }, 3000);
    return () => window.clearInterval(interval);
  }, [keySignature, viewSummaryStatus, windowDays]);

  async function syncMessages() {
    setSyncing(true);
    setError("");
    try {
      await readJson("/api/message-ingest", { method: "POST" });
      setOverview(await readJson<MessagesOverview>(overviewUrl(windowDays)));
    } catch (reason) {
      setError(String(reason));
      setSyncing(false);
    }
  }

  async function summarizeConversation() {
    if (!selectedKey) return;
    setRequestingSummary(true);
    setDetailError("");
    try {
      await readJson("/api/message-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_key: selectedKey,
          window_type: summaryWindow,
        }),
      });
      setDetail(await readJson<ConversationDetail>(detailUrl(selectedKey)));
    } catch (reason) {
      setDetailError(String(reason));
    } finally {
      setRequestingSummary(false);
    }
  }

  async function summarizeView() {
    if (!conversationKeys.length) return;
    setRequestingViewSummary(true);
    setSummaryError("");
    try {
      const value = await readJson<{ summary: MessageViewSummary }>(
        "/api/message-view-summary",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            window_days: windowDays,
            list_limit: "all",
            conversation_keys: conversationKeys,
          }),
        },
      );
      setViewSummary(value.summary);
      if (
        value.summary.status === "completed" ||
        value.summary.status === "failed"
      )
        setRequestingViewSummary(false);
    } catch (reason) {
      setSummaryError(String(reason));
      setRequestingViewSummary(false);
    }
  }

  const run = overview?.latestRun;
  const total = Number(
    run?.total_messages ??
      conversations.reduce(
        (sum, item) => sum + Number(item.message_count || 0),
        0,
      ),
  );
  const sent = Number(
    run?.sent_messages ??
      conversations.reduce(
        (sum, item) => sum + Number(item.sent_count || 0),
        0,
      ),
  );
  const received = Number(
    run?.received_messages ??
      conversations.reduce(
        (sum, item) => sum + Number(item.received_count || 0),
        0,
      ),
  );
  const isSyncing =
    syncing || ingestStatus === "queued" || ingestStatus === "running";
  const selectedConversation = overview?.topConversations.find(
    (item) => item.conversation_key === selectedKey,
  );

  return (
    <div className="eidos-v2-scroll h-full overflow-y-auto">
      <div className="mx-auto max-w-[1540px] px-4 pb-12 pt-6 sm:px-8 sm:pt-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[27px] font-semibold tracking-[-0.045em] text-[#19382e] sm:text-[32px]">
              Messages
            </h1>
            <p className="mt-1 text-[13px] text-[#5f7062]">
              {run?.exported_at
                ? `Last synced ${time(run.exported_at)}`
                : "Text message activity"}
            </p>
          </div>
          <button
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#d9dfd6] bg-white px-3 text-[13px] font-medium text-[#294638] transition hover:bg-[#f3f6f0] disabled:opacity-60"
            disabled={isSyncing}
            onClick={syncMessages}
            type="button"
          >
            <RefreshCw
              aria-hidden="true"
              className={`size-4 ${isSyncing ? "animate-spin" : ""}`}
              strokeWidth={1.8}
            />
            {isSyncing ? "Syncing" : "Sync now"}
          </button>
        </header>

        {error ? (
          <div
            role="alert"
            className="mt-5 rounded-xl border border-[#e8c5bf] bg-[#fff8f5] px-4 py-3 text-[13px] text-[#8b3c32]"
          >
            {error}
          </div>
        ) : null}
        {overview?.latestIngestRequest?.status === "failed" ? (
          <p role="status" className="mt-4 text-[13px] text-[#9d4b3e]">
            The last sync failed.
          </p>
        ) : null}

        <div className="mt-7 flex flex-wrap items-center gap-2 border-b border-[#e3e6df] pb-4">
          <span className="mr-2 text-[13px] font-medium text-[#56685a]">
            Time range
          </span>
          {([7, 30] as const).map((days) => (
            <button
              aria-pressed={windowDays === days}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${windowDays === days ? "bg-[#244534] text-white" : "text-[#637268] hover:bg-[#edf1e9]"}`}
              key={days}
              onClick={() => {
                setWindowDays(days);
                setOverview(null);
                setLoading(true);
                setSelectedKey("");
              }}
              type="button"
            >
              {days === 7 ? "7 days" : "30 days"}
            </button>
          ))}
        </div>

        {loading && !overview ? (
          <div role="status" className="py-16 text-[14px] text-[#5f7062]">
            Loading messages…
          </div>
        ) : !overview ? (
          <div className="py-12">
            <button
              className="rounded-lg border border-[#d9e3d7] bg-white px-3 py-2 text-[13px] font-medium text-[#315a3d] hover:bg-[#f3f7f0]"
              onClick={() => setRetryCount((value) => value + 1)}
              type="button"
            >
              Retry
            </button>
          </div>
        ) : overview ? (
          <>
            <section
              aria-label="Message totals"
              className="grid grid-cols-2 gap-3 py-6 lg:grid-cols-4"
            >
              <Metric label="Messages" value={total} />
              <Metric
                label="Conversations"
                value={Number(
                  run?.conversation_count ?? overview.topConversations.length,
                )}
              />
              <Metric label="Sent" value={sent} />
              <Metric label="Received" value={received} />
            </section>

            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(310px,400px)]">
              <section
                aria-label="Conversations"
                className={`min-w-0 overflow-hidden rounded-2xl border border-[#e1e6de] bg-white shadow-[0_2px_16px_rgba(32,54,38,0.035)] ${selectedKey ? "hidden xl:block" : "block"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e9ece6] px-4 py-4 sm:px-5">
                  <h2 className="text-[16px] font-semibold text-[#253e30]">
                    Conversations{" "}
                    <span className="ml-1 font-normal text-[#5f7062]">
                      {conversations.length}
                    </span>
                  </h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="relative block">
                      <Search
                        aria-hidden="true"
                        className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[#5f7062]"
                        strokeWidth={1.8}
                      />
                      <span className="sr-only">Search conversations</span>
                      <input
                        className="h-9 w-[160px] rounded-lg border border-[#e0e6dd] bg-[#fafbf8] pl-9 pr-2 text-[13px] text-[#213a2b] outline-none placeholder:text-[#5f7062] focus:border-[#8fae94] sm:w-[200px]"
                        onChange={(event) => {
                          setQuery(event.target.value);
                          setSelectedKey("");
                        }}
                        placeholder="Search"
                        type="search"
                        value={query}
                      />
                    </label>
                    <label className="sr-only" htmlFor="messages-sort">
                      Sort conversations
                    </label>
                    <select
                      className="h-9 rounded-lg border border-[#e0e6dd] bg-[#fafbf8] px-2 text-[13px] text-[#34503c] outline-none focus:border-[#8fae94]"
                      id="messages-sort"
                      onChange={(event) =>
                        setSortBy(event.target.value as SortBy)
                      }
                      value={sortBy}
                    >
                      <option value="messages">Most messages</option>
                      <option value="recent">Most recent</option>
                      <option value="name">Name</option>
                    </select>
                  </div>
                </div>
                {conversations.length ? (
                  <ul className="max-h-[760px] overflow-y-auto">
                    {conversations.map((conversation) => (
                      <li key={conversation.conversation_key}>
                        <button
                          aria-pressed={
                            selectedKey === conversation.conversation_key
                          }
                          className={`group flex w-full items-center gap-3 border-b border-[#f0f1ed] px-4 py-3 text-left transition last:border-b-0 hover:bg-[#f6f8f3] sm:px-5 ${selectedKey === conversation.conversation_key ? "bg-[#edf3eb]" : ""}`}
                          onClick={() =>
                            setSelectedKey(conversation.conversation_key)
                          }
                          type="button"
                        >
                          <span
                            aria-hidden="true"
                            className="grid size-9 shrink-0 place-items-center rounded-full bg-[#e8eee5] text-[13px] font-semibold text-[#49634e]"
                          >
                            {name(conversation).slice(0, 1).toLocaleUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-semibold text-[#253c2e] sm:text-[14px]">
                              {name(conversation)}
                            </span>
                            <span className="mt-0.5 block text-[12px] text-[#5f7062]">
                              {number.format(
                                Number(conversation.sent_count || 0),
                              )}{" "}
                              sent ·{" "}
                              {number.format(
                                Number(conversation.received_count || 0),
                              )}{" "}
                              received
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block text-[13px] font-semibold tabular-nums text-[#324d39]">
                              {number.format(
                                Number(conversation.message_count || 0),
                              )}
                            </span>
                            <span className="mt-0.5 block text-[11px] text-[#5f7062]">
                              {date(conversation.last_active)}
                            </span>
                          </span>
                          <ChevronRight
                            aria-hidden="true"
                            className="size-4 shrink-0 text-[#5f7062] transition group-hover:translate-x-0.5"
                            strokeWidth={1.7}
                          />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-5 py-10 text-[13px] text-[#5f7062]">
                    {query
                      ? "No conversations match that search."
                      : "No messages in this time range."}
                  </p>
                )}
              </section>

              <aside
                aria-label={
                  selectedKey ? "Conversation detail" : "Message analytics"
                }
                className="min-w-0 rounded-2xl border border-[#e1e6de] bg-white p-5 shadow-[0_2px_16px_rgba(32,54,38,0.035)] sm:p-6"
              >
                {selectedKey ? (
                  <>
                    <button
                      className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#53715b] hover:text-[#244534] xl:hidden"
                      onClick={() => setSelectedKey("")}
                      type="button"
                    >
                      <ArrowLeft aria-hidden="true" className="size-4" /> All
                      conversations
                    </button>
                    <h2 className="break-words text-[20px] font-semibold tracking-[-0.03em] text-[#213d2c]">
                      {selectedConversation
                        ? name(selectedConversation)
                        : "Conversation"}
                    </h2>
                    {detailLoading ? (
                      <p
                        role="status"
                        className="mt-5 text-[13px] text-[#5f7062]"
                      >
                        Loading conversation…
                      </p>
                    ) : null}
                    {detailError ? (
                      <p
                        role="alert"
                        className="mt-5 text-[13px] text-[#9d4b3e]"
                      >
                        {detailError}
                      </p>
                    ) : null}
                    {detail ? (
                      <ConversationPanel
                        detail={detail}
                        onSummarize={summarizeConversation}
                        requesting={requestingSummary}
                        summaryWindow={summaryWindow}
                        setSummaryWindow={setSummaryWindow}
                      />
                    ) : null}
                  </>
                ) : (
                  <OverviewPanel
                    conversations={conversations}
                    onSummarize={summarizeView}
                    received={visibleReceived}
                    requesting={
                      requestingViewSummary ||
                      viewSummaryStatus === "queued" ||
                      viewSummaryStatus === "running"
                    }
                    sent={visibleSent}
                    summary={viewSummary}
                    summaryError={summaryError}
                    total={visibleTotal}
                  />
                )}
              </aside>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[#e1e6de] bg-white px-4 py-4 sm:px-5">
      <p className="text-[12px] text-[#5f7062]">{label}</p>
      <p className="mt-1 text-[27px] font-semibold leading-none tracking-[-0.04em] tabular-nums text-[#22402e] sm:text-[30px]">
        {number.format(value)}
      </p>
    </div>
  );
}

function OverviewPanel({
  conversations,
  onSummarize,
  received,
  requesting,
  sent,
  summary,
  summaryError,
  total,
}: {
  conversations: Conversation[];
  onSummarize: () => void;
  received: number;
  requesting: boolean;
  sent: number;
  summary: MessageViewSummary | null;
  summaryError: string;
  total: number;
}) {
  const top = [...conversations]
    .sort((a, b) => Number(b.message_count || 0) - Number(a.message_count || 0))
    .slice(0, 5);
  const highest = Number(top[0]?.message_count || 0);
  return (
    <div>
      <h2 className="text-[18px] font-semibold tracking-[-0.025em] text-[#213d2c]">
        At a glance
      </h2>
      <p className="mt-1 text-[13px] text-[#5f7062]">
        {number.format(conversations.length)} conversations in this view
      </p>
      <div className="mt-6">
        <div className="flex justify-between text-[13px]">
          <span className="text-[#657568]">Sent</span>
          <span className="font-medium tabular-nums text-[#2b4b35]">
            {share(sent, total)}%
          </span>
        </div>
        <div
          aria-label={`${number.format(sent)} sent, ${number.format(received)} received`}
          className="mt-2 flex h-2 overflow-hidden rounded-full bg-[#dfe9df]"
          role="img"
        >
          <span
            className="bg-[#2e6147]"
            style={{ width: `${share(sent, total)}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-[12px] text-[#5f7062]">
          <span>{number.format(sent)} sent</span>
          <span>{number.format(received)} received</span>
        </div>
      </div>
      {top.length ? (
        <div className="mt-8 border-t border-[#edf0ea] pt-6">
          <h3 className="text-[13px] font-semibold text-[#3b5542]">
            Most active
          </h3>
          <ol className="mt-4 space-y-3">
            {top.map((conversation) => (
              <li key={conversation.conversation_key}>
                <div className="flex justify-between gap-3 text-[12px]">
                  <span className="truncate text-[#405744]">
                    {name(conversation)}
                  </span>
                  <span className="tabular-nums text-[#5f7062]">
                    {number.format(Number(conversation.message_count || 0))}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#edf1e9]">
                  <div
                    className="h-full rounded-full bg-[#88a58b]"
                    style={{
                      width: `${highest ? (Number(conversation.message_count || 0) / highest) * 100 : 0}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      <div className="mt-8 border-t border-[#edf0ea] pt-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[13px] font-semibold text-[#3b5542]">Summary</h3>
          <button
            className="rounded-lg border border-[#d9e3d7] px-2.5 py-1.5 text-[12px] font-medium text-[#315a3d] hover:bg-[#f3f7f0] disabled:opacity-50"
            disabled={requesting || !conversations.length}
            onClick={onSummarize}
            type="button"
          >
            {requesting ? "Summarizing…" : "Summarize view"}
          </button>
        </div>
        {summaryError ? (
          <p role="alert" className="mt-3 text-[12px] text-[#9d4b3e]">
            {summaryError}
          </p>
        ) : null}
        <SummaryText
          status={summary?.status}
          summary={summary?.summary}
          themes={summary?.themes}
        />
      </div>
    </div>
  );
}

function ConversationPanel({
  detail,
  onSummarize,
  requesting,
  setSummaryWindow,
  summaryWindow,
}: {
  detail: ConversationDetail;
  onSummarize: () => void;
  requesting: boolean;
  setSummaryWindow: (value: SummaryWindow) => void;
  summaryWindow: SummaryWindow;
}) {
  const conversation = detail.conversation;
  const latestSummary = detail.summaries?.[0];
  return (
    <div>
      <p className="mt-1 text-[12px] text-[#5f7062]">
        Last active {date(conversation.last_active)}
      </p>
      <div className="mt-6 grid grid-cols-3 gap-2 border-y border-[#edf0ea] py-4">
        <SmallMetric label="Messages" value={conversation.message_count} />
        <SmallMetric label="Sent" value={conversation.sent_count} />
        <SmallMetric label="Received" value={conversation.received_count} />
      </div>
      <div className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[13px] font-semibold text-[#3b5542]">Summary</h3>
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="conversation-summary-window">
              Summary window
            </label>
            <select
              className="h-8 rounded-lg border border-[#dfe6db] bg-white px-2 text-[12px] text-[#38543e]"
              id="conversation-summary-window"
              onChange={(event) =>
                setSummaryWindow(event.target.value as SummaryWindow)
              }
              value={summaryWindow}
            >
              {summaryWindows.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              className="rounded-lg border border-[#d9e3d7] px-2.5 text-[12px] font-medium text-[#315a3d] hover:bg-[#f3f7f0] disabled:opacity-50"
              disabled={
                requesting ||
                latestSummary?.status === "queued" ||
                latestSummary?.status === "running"
              }
              onClick={onSummarize}
              type="button"
            >
              {requesting ? "Requesting…" : "Summarize"}
            </button>
          </div>
        </div>
        <SummaryText
          status={latestSummary?.status}
          summary={latestSummary?.summary}
          themes={latestSummary?.themes}
        />
        {latestSummary?.relationship_notes ? (
          <p className="mt-3 text-[12px] leading-relaxed text-[#657467]">
            {latestSummary.relationship_notes}
          </p>
        ) : null}
      </div>
      <div className="mt-7 border-t border-[#edf0ea] pt-6">
        <h3 className="text-[13px] font-semibold text-[#3b5542]">
          Recent messages
        </h3>
        {detail.recentMessages?.length ? (
          <div className="mt-3 max-h-[460px] space-y-2 overflow-y-auto">
            {detail.recentMessages.map((message, index) => (
              <article
                className="rounded-xl bg-[#f7f9f5] px-3 py-2.5"
                key={`${message.timestamp}-${index}`}
              >
                <div className="flex justify-between gap-3 text-[11px]">
                  <span className="font-semibold text-[#43634a]">
                    {message.direction === "sent" ? "You" : name(conversation)}
                  </span>
                  <time className="shrink-0 text-[#5f7062]">
                    {time(message.timestamp)}
                  </time>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-[#3e5042]">
                  {message.body || ""}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-[12px] text-[#5f7062]">
            No recent messages in this window.
          </p>
        )}
      </div>
    </div>
  );
}

function SmallMetric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[11px] text-[#5f7062]">{label}</p>
      <p className="mt-1 text-[17px] font-semibold tabular-nums text-[#2a4934]">
        {number.format(Number(value || 0))}
      </p>
    </div>
  );
}

function SummaryText({
  status,
  summary,
  themes,
}: {
  status?: "queued" | "running" | "completed" | "failed";
  summary?: string | null;
  themes?: string[];
}) {
  if (!status) return null;
  if (status === "failed")
    return (
      <p role="status" className="mt-3 text-[12px] text-[#9d4b3e]">
        Summary failed.
      </p>
    );
  if (status !== "completed")
    return (
      <p role="status" className="mt-3 text-[12px] text-[#5f7062]">
        {status === "queued" ? "Queued…" : "Summarizing…"}
      </p>
    );
  return (
    <div className="mt-3">
      <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-[#4b5d4e]">
        {summary || "No summary text."}
      </p>
      {themes?.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {themes.map((theme) => (
            <span
              className="rounded-full bg-[#edf2e9] px-2 py-1 text-[11px] text-[#4b6a50]"
              key={theme}
            >
              {theme}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
