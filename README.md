# Eidos

Eidos is a fresh personal agent system for Andrew.

It replaces the old Clawd/OpenClaw-shaped setup with a profile-aware agent, a new portal, explicit but not fully manual memory, searchable messages, daily history, people context, skills visibility, and grounded check-ins.

Durable state should live in Cloudflare D1/R2. Local JSON is only for temporary bootstrap exports or adapter boundaries.

First build target:

- profile switching: personal, creative, bioinformatics
- Telegram gateway for direct conversation with Eidos
- iMessage/SMS ingest and recall
- people/contact resolution with conversational correction
- daily history grounded in meaningful events and conversations
- skills inventory and health checks
- morning/evening check-ins from calendar and messages
- new portal

Deferred:

- email integration
- automatic profile routing
- old-note migration beyond read-only archive/search
