-- Apply once to an existing agent_chat_turns table. New installs use agent_chat.sql.
ALTER TABLE agent_chat_turns ADD COLUMN settings_json TEXT;
