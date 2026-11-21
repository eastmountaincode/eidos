# Coordinated steering and maintenance release

Prepared 2026-11-20. Cloudflare Wrangler OAuth refresh failed with HTTP 400;
the Worker request token remains valid for chat, but is not a deployment token.
Do not push this change to main before deploying its backend and upgraded runner.
No production UI or queue changes have been released yet.

After Cloudflare login is restored on the Mac mini:

1. Use the clean commit containing this file. Run the production build, the
   `apps/api` tests, runner typecheck/client tests, maintenance tests, and live
   `scripts/verify-steering.ts` check with Codex 0.171.0 explicitly selected.
2. Query `PRAGMA table_info(agent_chat_turns)` through Wrangler. Apply
   `apps/api/agent_chat_followups.sql` once only if `parent_turn_id` is absent.
   Apply `apps/api/maintenance_capability.sql` (idempotent).
3. Deploy the Worker from that clean commit. Verify live Sources and Future
   endpoints and the isolated unchanged-ingest regression.
4. Compare installed shared settings and web adapter with their pre-upgrade
   versions. Back up those exact files, then install committed shared settings,
   web-chat.ts and steerable-codex.ts into `/Users/oasis/.eidos`. Keep secrets,
   memory, session IDs and the Telegram runner unchanged.
5. Install/bootstrap `ai.eidos.web-chat-steering.plist`, which selects the isolated
   Codex 0.171.0 runtime. Old workers cannot claim new jobs after the protocol gate;
   they may finish existing replies. Verify a dedicated live queue conversation
   with same-model follow-ups and a model-switch continuation. Retire
   `ai.eidos.web-chat` only after its current reply has been persisted.
6. Push the coordinated commit to origin/main. Vercel Git integration publishes
   the portal. Verify the canonical domain, model picker, mobile composer, rapid
   follow-ups and history refresh. Do not use Vercel CLI deploy/promote.
7. The maintenance LaunchAgent is installed but held by
   `data/maintenance/pending-release.json`. Remove that marker after the combined
   release passes verification. Run its read-only `--check`, update capability
   notes/checks, and keep detailed logs in `data/maintenance`.

Verification before release: production build; 21 Worker tests including queue
claim races, steering ownership, model-order barriers and additive migration;
7 client/runner tests; 2 maintenance tests; mobile WebKit sent two follow-ups
while a root remained running, with 16px text and no horizontal overflow;
real app-server steering and Sol 6.2 to Astra 6.2 session continuation.
