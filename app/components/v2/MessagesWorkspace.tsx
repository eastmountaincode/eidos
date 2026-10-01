"use client";

import { ArrowLeft, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Conversation,
  ConversationDetail,
  MessageViewSummary,
  MessagesOverview,
  SummaryWindow,
} from "@/types/messages";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { messageSyncState } from "@/lib/message-sync-state";

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

export function MessagesWorkspace() {
  const [windowDays, setWindowDays] = useState<WindowDays>(30);
  const [retryCount, setRetryCount] = useState(0);
  const [sortBy, setSortBy] = useState<SortBy>("recent");
  const [query, setQuery] = useState("");
  const [overview, setOverview] = useState<MessagesOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [showOverview, setShowOverview] = useState(false);
  const selection = useRef("");
  selection.current = selectedKey;
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

  const ingestStatus = messageSyncState(overview?.latestIngestRequest);
  useEffect(() => {
    if (!syncing && ingestStatus !== "queued" && ingestStatus !== "running")
      return;
    let cancelled = false;
    const interval = window.setInterval(() => {
      readJson<MessagesOverview>(overviewUrl(windowDays))
        .then((value) => {
          if (cancelled) return;
          setOverview(value);
          if (
            value.latestIngestRequest?.status !== "queued" &&
            value.latestIngestRequest?.status !== "running"
          ) {
            setSyncing(false);
          }
        })
        .catch((reason) => {
          if (cancelled) return;
          setError(String(reason));
          setSyncing(false);
        });
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
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
        .then((value) => {
          if (selection.current === selectedKey) setDetail(value);
        })
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
    } finally {
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
      const value = await readJson<ConversationDetail>(detailUrl(selectedKey));
      if (selection.current === selectedKey) setDetail(value);
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
  const isSyncing =
    syncing || ingestStatus === "queued" || ingestStatus === "running";
  const selectedConversation = overview?.topConversations.find(
    (item) => item.conversation_key === selectedKey,
  );
  const paneOpen = Boolean(selectedKey) || showOverview;

  return (
    <section aria-label="Messages" className="flex h-full min-h-0 flex-col">
      <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <h1 className="mr-auto text-sm font-semibold">Messages</h1>
        <Button
          variant={showOverview ? "secondary" : "ghost"}
          size="sm"
          className="h-7 px-2 text-xs font-normal"
          onClick={() => {
            setSelectedKey("");
            setShowOverview((value) => !value);
          }}
        >
          Overview
        </Button>
        <NativeSelect
          aria-label="Message time range"
          className="h-7 rounded-sm text-xs"
          value={windowDays}
          onChange={(e) => {
            setWindowDays(Number(e.target.value) as WindowDays);
            setOverview(null);
            setLoading(true);
            setSelectedKey("");
          }}
        >
          <option value={7}>7 days</option>
          <option value={30}>30 days</option>
        </NativeSelect>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={
            ingestStatus === "stale"
              ? "Previous sync request needs attention"
              : isSyncing
                ? "Syncing messages"
                : "Sync messages"
          }
          title={
            ingestStatus === "stale"
              ? "The previous request has not reported progress. Automatic exports are separate."
              : run?.exported_at
                ? `Last synced ${time(run.exported_at)}`
                : "Sync messages"
          }
          disabled={isSyncing || ingestStatus === "stale"}
          onClick={syncMessages}
        >
          <RefreshCw
            className={`size-3.5 ${isSyncing ? "animate-spin motion-reduce:animate-none" : ""}`}
          />
        </Button>
      </header>
      {error && (
        <p
          role="alert"
          className="border-b border-border px-3 py-2 text-xs text-destructive"
        >
          {error}
        </p>
      )}
      {ingestStatus === "failed" && (
        <p
          role="status"
          className="border-b border-border px-3 py-2 text-xs text-destructive"
        >
          Last sync failed. Try syncing again.
        </p>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section
          aria-label="Conversations"
          className={`min-h-0 flex-col border-border lg:flex lg:border-r ${paneOpen ? "hidden" : "flex"}`}
        >
          <div className="grid gap-2 border-b border-border p-3">
            <label className="relative">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label="Search conversations"
                className="h-8 rounded-sm pl-7 text-[13px] shadow-none"
                placeholder="Find a conversation"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {loading ? "Loading…" : `${conversations.length} conversations`}
              </span>
              <NativeSelect
                aria-label="Sort conversations"
                className="h-6 rounded-sm border-0 bg-transparent py-0 text-xs shadow-none"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
              >
                <option value="recent">Recent</option>
                <option value="name">Name</option>
                <option value="messages">Most messages</option>
              </NativeSelect>
            </div>
          </div>
          <div className="eidos-v2-scroll min-h-0 flex-1 overflow-y-auto">
            {loading && !overview ? (
              <p role="status" className="p-4 text-xs text-muted-foreground">
                Loading conversations…
              </p>
            ) : !overview ? (
              <Button
                variant="outline"
                size="sm"
                className="m-3"
                onClick={() => setRetryCount((n) => n + 1)}
              >
                Retry
              </Button>
            ) : conversations.length ? (
              <ul>
                {conversations.map((conversation) => (
                  <li key={conversation.conversation_key}>
                    <button
                      type="button"
                      aria-pressed={
                        selectedKey === conversation.conversation_key
                      }
                      onClick={() => {
                        setSelectedKey(conversation.conversation_key);
                        setShowOverview(false);
                      }}
                      className={`block w-full border-b border-border/50 px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selectedKey === conversation.conversation_key ? "bg-accent" : "hover:bg-muted"}`}
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-[13px] font-medium">
                          {name(conversation)}
                        </span>
                        <time className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                          {date(conversation.last_active)}
                        </time>
                      </span>
                      <span className="mt-0.5 block text-[11px] tabular-nums text-muted-foreground">
                        {number.format(Number(conversation.sent_count || 0))}{" "}
                        sent ·{" "}
                        {number.format(
                          Number(conversation.received_count || 0),
                        )}{" "}
                        received
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-4 text-xs text-muted-foreground">
                {query
                  ? "No matching conversations."
                  : "No conversations in this time range."}
              </p>
            )}
          </div>
          {run?.exported_at && (
            <div
              className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground"
              role="status"
            >
              {isSyncing ? "Syncing…" : `Synced ${time(run.exported_at)}`}
              {ingestStatus === "stale" && (
                <span className="mt-0.5 block text-destructive">
                  Manual sync request needs attention
                </span>
              )}
            </div>
          )}
        </section>
        <section
          aria-label={selectedKey ? "Conversation detail" : "Overview"}
          className={`min-h-0 min-w-0 flex-col lg:flex ${paneOpen ? "flex" : "hidden"}`}
        >
          {paneOpen && (
            <div className="flex h-10 shrink-0 items-center border-b border-border px-2 lg:hidden">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => {
                  setSelectedKey("");
                  setShowOverview(false);
                }}
              >
                <ArrowLeft className="size-3.5" />
                Conversations
              </Button>
            </div>
          )}
          {selectedKey ? (
            <>
              <div className="border-b border-border px-5 py-3">
                <h2 className="truncate text-sm font-semibold">
                  {selectedConversation
                    ? name(selectedConversation)
                    : "Conversation"}
                </h2>
                {selectedConversation && (
                  <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                    {number.format(selectedConversation.message_count)} messages
                    · {number.format(selectedConversation.sent_count)} sent ·{" "}
                    {number.format(selectedConversation.received_count)}{" "}
                    received
                  </p>
                )}
              </div>
              {detailLoading && (
                <p role="status" className="p-5 text-xs text-muted-foreground">
                  Loading conversation…
                </p>
              )}
              {detailError && (
                <p role="alert" className="px-5 py-3 text-xs text-destructive">
                  {detailError}
                </p>
              )}
              {detail &&
                detail.conversation.conversation_key === selectedKey && (
                  <ConversationPanel
                    key={selectedKey}
                    detail={detail}
                    onSummarize={summarizeConversation}
                    requesting={requestingSummary}
                    summaryWindow={summaryWindow}
                    setSummaryWindow={setSummaryWindow}
                  />
                )}
            </>
          ) : showOverview ? (
            <div className="eidos-v2-scroll overflow-y-auto p-5">
              <h2 className="text-sm font-semibold">Overview</h2>
              <p className="mt-2 text-xs tabular-nums text-muted-foreground">
                {number.format(visibleTotal)} messages · {conversations.length}{" "}
                conversations · {number.format(visibleSent)} sent ·{" "}
                {number.format(visibleReceived)} received
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {query ? `Matching “${query}” · ` : ""}Last {windowDays} days
              </p>
              <div className="mt-6 flex items-center justify-between border-b border-border pb-2">
                <h3 className="text-xs font-medium">Summary</h3>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-sm text-xs"
                  disabled={
                    !conversations.length ||
                    requestingViewSummary ||
                    viewSummaryStatus === "queued" ||
                    viewSummaryStatus === "running"
                  }
                  onClick={summarizeView}
                >
                  {requestingViewSummary ? "Summarizing…" : "Summarize view"}
                </Button>
              </div>
              {summaryError && (
                <p role="alert" className="mt-3 text-xs text-destructive">
                  {summaryError}
                </p>
              )}
              <SummaryText
                status={viewSummary?.status}
                summary={viewSummary?.summary}
                themes={viewSummary?.themes}
              />
            </div>
          ) : (
            <div className="grid flex-1 place-items-center">
              <p className="text-xs text-muted-foreground">
                Select a conversation
              </p>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function ConversationPanel({
  detail,
  onSummarize,
  requesting,
  summaryWindow,
  setSummaryWindow,
}: {
  detail: ConversationDetail;
  onSummarize: () => void;
  requesting: boolean;
  summaryWindow: SummaryWindow;
  setSummaryWindow: (value: SummaryWindow) => void;
}) {
  const latest = detail.summaries?.[0];
  return (
    <Tabs
      defaultValue="messages"
      className="flex min-h-0 flex-1 flex-col gap-0"
    >
      <TabsList
        aria-label="Conversation view"
        variant="line"
        className="h-10 w-full shrink-0 justify-start rounded-none border-b border-border px-4"
      >
        <TabsTrigger value="messages" className="flex-none text-xs">
          Messages
        </TabsTrigger>
        <TabsTrigger value="summary" className="flex-none text-xs">
          Summary
        </TabsTrigger>
      </TabsList>
      <TabsContent
        value="messages"
        className="eidos-v2-scroll min-h-0 overflow-y-auto px-5"
      >
        {detail.recentMessages?.length ? (
          <ol className="divide-y divide-border/60">
            {detail.recentMessages.map((message, i) => (
              <li key={`${message.timestamp}-${i}`} className="py-3">
                <div className="mb-1 flex items-baseline justify-between gap-3 text-[11px]">
                  <span className="font-medium">
                    {message.direction === "sent"
                      ? "You"
                      : name(detail.conversation)}
                  </span>
                  <time className="shrink-0 tabular-nums text-muted-foreground">
                    {time(message.timestamp)}
                  </time>
                </div>
                <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">
                  {message.body || "Attachment"}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="py-4 text-xs text-muted-foreground">
            No recent messages in this window.
          </p>
        )}
      </TabsContent>
      <TabsContent
        value="summary"
        className="eidos-v2-scroll min-h-0 overflow-y-auto p-5"
      >
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect
            aria-label="Summary window"
            className="h-8 rounded-sm text-xs"
            value={summaryWindow}
            onChange={(e) => setSummaryWindow(e.target.value as SummaryWindow)}
          >
            {summaryWindows.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </NativeSelect>
          <Button
            variant="outline"
            size="sm"
            className="rounded-sm text-xs"
            disabled={
              requesting ||
              latest?.status === "queued" ||
              latest?.status === "running"
            }
            onClick={onSummarize}
          >
            {requesting ? "Requesting…" : "Summarize"}
          </Button>
        </div>
        <SummaryText
          status={latest?.status}
          summary={latest?.summary}
          themes={latest?.themes}
        />
        {latest?.relationship_notes && (
          <p className="mt-4 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">
            {latest.relationship_notes}
          </p>
        )}
      </TabsContent>
    </Tabs>
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
  if (status !== "completed")
    return (
      <p
        role="status"
        className={`mt-4 text-xs ${status === "failed" ? "text-destructive" : "text-muted-foreground"}`}
      >
        {status === "failed"
          ? "Summary failed."
          : status === "queued"
            ? "Queued…"
            : "Summarizing…"}
      </p>
    );
  return (
    <div className="mt-4">
      <p className="whitespace-pre-wrap text-[13px] leading-relaxed">
        {summary || "No summary text."}
      </p>
      {themes?.length ? (
        <p className="mt-4 text-xs text-muted-foreground">
          {themes.join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
