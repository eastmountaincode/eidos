export type MessageRun = {
  id?: string;
  exported_at?: string | null;
  source?: string | null;
  window_days?: number | null;
  total_messages?: number | null;
  sent_messages?: number | null;
  received_messages?: number | null;
  conversation_count?: number | null;
  last_message_at?: string | null;
};

export type Conversation = {
  conversation_key: string;
  display_name: string;
  handle?: string | null;
  chat_type?: string | null;
  message_count: number;
  sent_count: number;
  received_count: number;
  last_active?: string | null;
};

export type MessagePreview = {
  timestamp?: string | null;
  direction?: string | null;
  chat_type?: string | null;
  body?: string | null;
};

export type ConversationSummary = {
  id: string;
  conversation_key: string;
  display_name: string;
  window_type: SummaryWindow;
  window_days?: number | null;
  message_limit?: number | null;
  status: "queued" | "running" | "completed" | "failed";
  requested_at?: string | null;
  started_at?: string | null;
  generated_at?: string | null;
  message_count?: number | null;
  source_start_at?: string | null;
  source_end_at?: string | null;
  summary?: string | null;
  themes?: string[];
  relationship_notes?: string | null;
  model?: string | null;
  error?: string | null;
  updated_at?: string | null;
};

export type MessagesOverview = {
  status: "active" | "pending" | string;
  latestRun?: MessageRun | null;
  topConversations: Conversation[];
};

export type ConversationDetail = {
  conversation: Conversation;
  recentMessages: MessagePreview[];
  summaries: ConversationSummary[];
};

export type SummaryWindow = "week" | "two_weeks" | "month" | "last_100";
