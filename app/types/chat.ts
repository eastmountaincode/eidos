export type ChatTurn = {
  seq: number;
  id: string;
  conversation_id: string;
  prompt: string;
  response: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  revision: number;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type ChatHistory = { turns: ChatTurn[]; has_more: boolean; agent_online: boolean };
