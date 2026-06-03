import type { ConversationDetail, MessagesOverview, SummaryWindow } from "@/types/messages";

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

export function getMessagesOverview() {
  return workerFetch<MessagesOverview>("/api/messages/overview");
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
