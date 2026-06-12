import type { CapabilitiesResponse } from "@/types/capabilities";
import type { MantraResponse } from "@/types/mantra";
import type { MemoryResponse } from "@/types/memory";
import type { ConversationDetail, MessageIngestRequest, MessagesOverview, SummaryWindow } from "@/types/messages";

function workerBaseUrl() {
  const workerUrl = process.env.EIDOS_WORKER_URL;
  if (!workerUrl) throw new Error("Missing EIDOS_WORKER_URL");
  return workerUrl.replace(/\/$/, "");
}

function apiToken() {
  const token = process.env.EIDOS_API_TOKEN;
  if (!token) throw new Error("Missing EIDOS_API_TOKEN");
  return token;
}

async function workerFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${workerBaseUrl()}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${apiToken()}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Worker request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function getMessagesOverview(windowDays = 30) {
  const query = new URLSearchParams({ window_days: String(windowDays) });
  return workerFetch<MessagesOverview>(`/api/messages/overview?${query}`);
}

export function getCapabilities() {
  return workerFetch<CapabilitiesResponse>("/api/capabilities");
}

export function getMantra() {
  return workerFetch<MantraResponse>("/api/mantra");
}

export function getMemory(date?: string) {
  const query = date ? `?${new URLSearchParams({ date })}` : "";
  return workerFetch<MemoryResponse>(`/api/memory${query}`);
}

export function deleteMemoryNote(kind: "memory" | "person", id: string) {
  const pathKind = kind === "person" ? "people" : "notes";
  return workerFetch<{ deleted: boolean; id: string; kind: string }>(`/api/memory/${pathKind}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function updateMantra(body: string) {
  return workerFetch<MantraResponse>("/api/mantra", {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function requestMessagesIngest() {
  return workerFetch<{ request: MessageIngestRequest; reused: boolean }>("/api/messages/ingest-request", {
    method: "POST",
  });
}

export function getConversationDetail(conversationKey: string) {
  const query = new URLSearchParams({ conversation_key: conversationKey });
  return workerFetch<ConversationDetail>(`/api/messages/conversation?${query}`);
}

export function requestConversationSummary(conversationKey: string, windowType: SummaryWindow) {
  return workerFetch("/api/messages/summary-request", {
    method: "POST",
    body: JSON.stringify({
      conversation_key: conversationKey,
      window_type: windowType,
    }),
  });
}
