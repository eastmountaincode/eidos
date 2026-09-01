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

## Deployment workflow

GitHub is the source of truth for Eidos. The canonical repository is
[`eastmountaincode/eidos`](https://github.com/eastmountaincode/eidos), and Vercel
is linked to its `main` branch.

1. Make and test changes in this repository.
2. Commit every production file and push the commit to GitHub.
3. Let Vercel create the production deployment from that Git commit.
4. Verify the custom domain is serving the same commit.

Do not run a direct Vercel production deployment from a local checkout. In
particular, never deploy a dirty working tree: it creates an artifact that
cannot be reconstructed from GitHub.

The Cloudflare Worker in `apps/api` is deployed separately, but it must be
tested and deployed from the same clean Git commit as the portal that consumes
it. Run its tests before deployment and verify both catalog endpoints and the
incremental Messages ingest afterward.
