-- Additive migration: queued follow-ups are durable, one root executes per conversation.
ALTER TABLE agent_chat_turns ADD COLUMN parent_turn_id TEXT;
DROP INDEX IF EXISTS idx_agent_chat_active;
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_chat_running ON agent_chat_turns(conversation_id)
  WHERE status = 'running' AND parent_turn_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_agent_chat_parent ON agent_chat_turns(parent_turn_id);
