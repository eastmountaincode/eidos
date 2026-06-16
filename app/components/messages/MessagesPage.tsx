"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Conversation, ConversationDetail as ConversationDetailType, MessageViewSummary, MessagesOverview, SummaryWindow } from "@/types/messages";
import { ConversationDetail } from "./ConversationDetail";
import { PeopleTable } from "./PeopleTable";
import { shortSource } from "./format";
import { SummaryLine } from "./SummaryLine";
import { ViewSummaryPanel } from "./ViewSummaryPanel";

type OverviewWindow = 7 | 30;
type ListLimit = 20 | "all";

async function fetchConversationDetail(conversationKey: string) {
  const response = await fetch(`/api/message-detail?conversation_key=${encodeURIComponent(conversationKey)}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<ConversationDetailType>;
}

async function fetchMessagesOverview(windowDays: OverviewWindow) {
  const response = await fetch(`/api/messages?window_days=${windowDays}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<MessagesOverview>;
}

async function fetchMessageViewSummary(windowDays: OverviewWindow, listLimit: ListLimit, conversationKeys: string[]) {
  const query = new URLSearchParams({
    window_days: String(windowDays),
    list_limit: String(listLimit),
  });
  for (const key of conversationKeys) {
    query.append("conversation_key", key);
  }

  const response = await fetch(`/api/message-view-summary?${query}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<{ summary: MessageViewSummary | null }>;
}

function remoteTime(value?: string | null) {
  if (!value) return 0;
  const normalized = /^\d{4}-\d{2}-\d{2} /.test(value) ? `${value.replace(" ", "T")}Z` : value;
  const time = new Date(normalized).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function MessagesPage({ initialData }: { initialData: MessagesOverview }) {
  const [data, setData] = useState(initialData);
  const [overviewWindow, setOverviewWindow] = useState<OverviewWindow>(30);
  const [listLimit, setListLimit] = useState<ListLimit>(20);
  const [selectedKey, setSelectedKey] = useState("");
  const [visibleConversations, setVisibleConversations] = useState<Conversation[]>(() => initialData.topConversations.slice(0, 20));
  const [detail, setDetail] = useState<ConversationDetailType | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [isRequestingSummary, setIsRequestingSummary] = useState(false);
  const [viewSummary, setViewSummary] = useState<MessageViewSummary | null>(null);
  const [isLoadingViewSummary, setIsLoadingViewSummary] = useState(false);
  const [isRequestingViewSummary, setIsRequestingViewSummary] = useState(false);
  const [viewSummaryError, setViewSummaryError] = useState("");
  const [isRequestingIngest, setIsRequestingIngest] = useState(false);
  const visibleConversationKeys = useMemo(
    () => visibleConversations.map((conversation) => conversation.conversation_key),
    [visibleConversations],
  );
  const visibleConversationKeySignature = visibleConversationKeys.join("\n");
  const visibleMessageCount = useMemo(
    () => visibleConversations.reduce((total, conversation) => total + Number(conversation.message_count || 0), 0),
    [visibleConversations],
  );
  const handleSelectConversation = useCallback((conversationKey: string) => {
    setSelectedKey(conversationKey);
    if (!conversationKey) {
      setDetail(null);
      setDetailError("");
    }
  }, []);
  const handleVisibleChange = useCallback((conversations: Conversation[]) => {
    setVisibleConversations(conversations);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchMessagesOverview(overviewWindow)
      .then((nextData) => {
        if (cancelled) return;
        setData(nextData);
        if (selectedKey && !nextData.topConversations.some((conversation) => conversation.conversation_key === selectedKey)) {
          setSelectedKey("");
          setDetail(null);
        }
      })
      .catch((error) => {
        if (!cancelled) setDetailError(`Could not load ${overviewWindow}d message window: ${String(error)}`);
      });

    return () => {
      cancelled = true;
    };
  }, [overviewWindow]);

  useEffect(() => {
    if (!selectedKey) return;

    let cancelled = false;
    setIsLoadingDetail(true);
    setDetailError("");

    fetchConversationDetail(selectedKey)
      .then((nextDetail) => {
        if (!cancelled) setDetail(nextDetail);
      })
      .catch((error) => {
        if (!cancelled) setDetailError(`Could not load conversation detail: ${String(error)}`);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDetail(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedKey]);

  useEffect(() => {
    if (!selectedKey) return;
    const latestSummary = detail?.summaries[0];
    if (!latestSummary || !["queued", "running"].includes(latestSummary.status)) return;

    let cancelled = false;
    const interval = window.setInterval(() => {
      fetchConversationDetail(selectedKey)
        .then((nextDetail) => {
          if (!cancelled) setDetail(nextDetail);
        })
        .catch((error) => {
          if (!cancelled) setDetailError(`Could not refresh summary status: ${String(error)}`);
        });
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [selectedKey, detail?.summaries]);

  useEffect(() => {
    const status = data.latestIngestRequest?.status;
    if (!isRequestingIngest && !["queued", "running"].includes(status || "")) return;

    let cancelled = false;
    const interval = window.setInterval(() => {
      fetchMessagesOverview(overviewWindow)
        .then((nextData) => {
          if (cancelled) return;
          setData(nextData);
          const nextStatus = nextData.latestIngestRequest?.status;
          if (!["queued", "running"].includes(nextStatus || "")) {
            setIsRequestingIngest(false);
            if (selectedKey) {
              fetchConversationDetail(selectedKey)
                .then((nextDetail) => {
                  if (!cancelled) setDetail(nextDetail);
                })
                .catch((error) => {
                  if (!cancelled) setDetailError(`Could not refresh conversation detail: ${String(error)}`);
                });
            }
          }
        })
        .catch((error) => {
          if (!cancelled) setDetailError(`Could not refresh ingest status: ${String(error)}`);
        });
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [data.latestIngestRequest?.status, isRequestingIngest, overviewWindow, selectedKey]);

  const loadViewSummary = useCallback(async ({ quiet = false }: { quiet?: boolean } = {}) => {
    const keys = visibleConversationKeySignature ? visibleConversationKeySignature.split("\n") : [];
    if (!keys.length) {
      setViewSummary(null);
      return null;
    }

    if (!quiet) {
      setIsLoadingViewSummary(true);
      setViewSummaryError("");
    }

    try {
      const response = await fetchMessageViewSummary(overviewWindow, listLimit, keys);
      setViewSummary(response.summary);
      return response.summary;
    } catch (error) {
      setViewSummaryError(`Could not load current view summary: ${String(error)}`);
      return null;
    } finally {
      if (!quiet) setIsLoadingViewSummary(false);
    }
  }, [listLimit, overviewWindow, visibleConversationKeySignature]);

  useEffect(() => {
    if (selectedKey) return;
    void loadViewSummary();
  }, [loadViewSummary, selectedKey]);

  useEffect(() => {
    if (selectedKey) return;
    const status = viewSummary?.status;
    if (!isRequestingViewSummary && !["queued", "running"].includes(status || "")) return;

    let cancelled = false;
    const interval = window.setInterval(() => {
      loadViewSummary({ quiet: true })
        .then((summary) => {
          if (cancelled) return;
          if (!["queued", "running"].includes(summary?.status || "")) {
            setIsRequestingViewSummary(false);
          }
        })
        .catch((error) => {
          if (!cancelled) setViewSummaryError(`Could not refresh current view summary: ${String(error)}`);
        });
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isRequestingViewSummary, loadViewSummary, selectedKey, viewSummary?.status]);

  async function requestSummary(windowType: SummaryWindow) {
    if (!selectedKey) return;

    setIsRequestingSummary(true);
    setDetailError("");
    try {
      const response = await fetch("/api/message-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_key: selectedKey,
          window_type: windowType,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      setDetail(await fetchConversationDetail(selectedKey));
    } catch (error) {
      setDetailError(`Summary request failed: ${String(error)}`);
    } finally {
      setIsRequestingSummary(false);
    }
  }

  async function requestViewSummary() {
    const keys = visibleConversationKeySignature ? visibleConversationKeySignature.split("\n") : [];
    if (!keys.length) return;

    setIsRequestingViewSummary(true);
    setViewSummaryError("");
    try {
      const response = await fetch("/api/message-view-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          window_days: overviewWindow,
          list_limit: String(listLimit),
          conversation_keys: keys,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const next = (await response.json()) as { summary: MessageViewSummary };
      setViewSummary(next.summary);
      if (!["queued", "running"].includes(next.summary?.status || "")) {
        setIsRequestingViewSummary(false);
      }
    } catch (error) {
      setIsRequestingViewSummary(false);
      setViewSummaryError(`Current view summary request failed: ${String(error)}`);
    }
  }

  async function requestIngest() {
    setIsRequestingIngest(true);
    setDetailError("");
    try {
      const response = await fetch("/api/message-ingest", {
        method: "POST",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setData(await fetchMessagesOverview(overviewWindow));
    } catch (error) {
      setIsRequestingIngest(false);
      setDetailError(`Ingest request failed: ${String(error)}`);
    }
  }

  const run = data.latestRun;
  const ingestStatus = data.latestIngestRequest?.status;
  const isIngesting = isRequestingIngest || ["queued", "running"].includes(ingestStatus || "");
  const ingestFailed = ingestStatus === "failed"
    && remoteTime(data.latestIngestRequest?.requested_at) > remoteTime(run?.exported_at);

  return (
    <div className="grid gap-3">
      <header>
        <h2 className="text-[26px] font-bold leading-tight">Messages</h2>
      </header>

      <SummaryLine
        conversationCount={data.topConversations.length}
        ingestFailed={ingestFailed}
        isIngesting={isIngesting}
        onIngest={requestIngest}
        run={run}
      />

      <section className="grid items-start gap-3 xl:grid-cols-[minmax(620px,1fr)_minmax(320px,380px)]">
        <section className="min-w-0 rounded-lg border border-border bg-white p-2.5 sm:p-3">
          <div className="mb-2 flex flex-wrap justify-start gap-2 sm:justify-end">
            <WindowToggle value={overviewWindow} onChange={setOverviewWindow} />
            <ListLimitToggle value={listLimit} onChange={setListLimit} />
          </div>
          <PeopleTable
            conversations={data.topConversations}
            limit={listLimit}
            onSelect={handleSelectConversation}
            onVisibleChange={handleVisibleChange}
            selectedKey={selectedKey}
          />
        </section>

        <aside className="min-w-0 rounded-lg border border-border bg-white p-2.5 sm:p-3">
          {selectedKey ? (
            <ConversationDetail
              detail={detail}
              error={detailError}
              isLoading={isLoadingDetail}
              isRequestingSummary={isRequestingSummary}
              onRequestSummary={requestSummary}
            />
          ) : (
            <ViewSummaryPanel
              error={viewSummaryError}
              isLoading={isLoadingViewSummary}
              isRequesting={isRequestingViewSummary}
              listLimit={listLimit}
              messageCount={visibleMessageCount}
              onRequestSummary={requestViewSummary}
              summary={viewSummary}
              visibleCount={visibleConversations.length}
              windowDays={overviewWindow}
            />
          )}
        </aside>
      </section>

      <section className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        <span>Cloudflare D1</span>
        <span>{shortSource(run?.source)}</span>
      </section>
    </div>
  );
}

function ListLimitToggle({
  onChange,
  value,
}: {
  value: ListLimit;
  onChange: (value: ListLimit) => void;
}) {
  const options: Array<{ label: string; value: ListLimit }> = [
    { label: "Top 20", value: 20 },
    { label: "All", value: "all" },
  ];

  return <SegmentedToggle options={options} value={value} onChange={onChange} />;
}

function WindowToggle({
  onChange,
  value,
}: {
  value: OverviewWindow;
  onChange: (value: OverviewWindow) => void;
}) {
  const options: Array<{ label: string; value: OverviewWindow }> = [
    { label: "Last week", value: 7 },
    { label: "Last 30 days", value: 30 },
  ];

  return <SegmentedToggle options={options} value={value} onChange={onChange} />;
}

function SegmentedToggle<T extends string | number>({
  onChange,
  options,
  value,
}: {
  options: Array<{ label: string; value: T }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex h-7 rounded-md border border-border bg-[#f7fafa] p-0.5">
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            className={`rounded px-2 text-[11px] font-bold ${
              isActive ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"
            }`}
            key={String(option.value)}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
