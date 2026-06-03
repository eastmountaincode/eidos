"use client";

import { useEffect, useState } from "react";
import type { ConversationDetail as ConversationDetailType, MessagesOverview, SummaryWindow } from "@/types/messages";
import { ConversationDetail } from "./ConversationDetail";
import { PeopleTable } from "./PeopleTable";
import { shortSource } from "./format";
import { SummaryLine } from "./SummaryLine";

async function fetchConversationDetail(conversationKey: string) {
  const response = await fetch(`/api/message-detail?conversation_key=${encodeURIComponent(conversationKey)}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<ConversationDetailType>;
}

export function MessagesPage({ initialData }: { initialData: MessagesOverview }) {
  const [data] = useState(initialData);
  const [selectedKey, setSelectedKey] = useState("");
  const [detail, setDetail] = useState<ConversationDetailType | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [isRequestingSummary, setIsRequestingSummary] = useState(false);

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

  const run = data.latestRun;
  const windowDays = run?.window_days ?? 30;

  return (
    <div className="grid gap-3">
      <header className="flex items-start justify-between gap-4">
        <h2 className="text-[26px] font-bold leading-tight">Messages</h2>
        <span className="rounded-full bg-[#dff3e8] px-2.5 py-1 text-[11px] font-bold text-[#166534]">
          {data.status === "active" ? "Connected" : "Not connected"}
        </span>
      </header>

      <SummaryLine conversationCount={data.topConversations.length} run={run} />

      <section className="grid items-start gap-3 xl:grid-cols-[minmax(620px,1fr)_minmax(320px,380px)]">
        <section className="rounded-lg border border-border bg-white p-3">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold">People</h3>
              <p className="text-sm text-muted">Last {windowDays} days, sorted by message count.</p>
            </div>
            <span className="rounded-full bg-[#dff3e8] px-2 py-1 text-[11px] font-bold text-[#166534]">{data.status}</span>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[520px]">
              <PeopleTable conversations={data.topConversations} onSelect={setSelectedKey} selectedKey={selectedKey} />
            </div>
          </div>
        </section>

        <aside className="rounded-lg border border-border bg-white p-3">
          <ConversationDetail
            detail={detail}
            error={detailError}
            isLoading={isLoadingDetail}
            isRequestingSummary={isRequestingSummary}
            onRequestSummary={requestSummary}
          />
        </aside>
      </section>

      <section className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        <span>Cloudflare D1</span>
        <span>{shortSource(run?.source)}</span>
      </section>
    </div>
  );
}
