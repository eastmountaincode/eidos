# Eidos web conversation

The portal sends authenticated requests to its own `/api/chat` route. That route
uses the existing Worker URL and token to reach `/api/agent-chat`. Messages and
replies are stored in D1. A separate Mac mini service makes outbound HTTPS
requests to claim work and uses the same Codex runner, identity, memory and local
tools as Telegram. The browser needs only the Eidos website; it does not connect
to the Mac mini or require Tailscale.

The interface currently has one persistent conversation (`main`). Storage uses
conversation IDs so separate conversations can be added later. This web stream
has its own Codex session; it reads the same persistent memory but does not
import Telegram's transcript or change Telegram's session.

## Model and speed

The composer has one compact model button. Its menu contains GPT-6.1 Sol,
GPT-6 Astra, GPT-6 Luna and Standard/Fast processing.
Fast uses more of the existing ChatGPT/Codex allowance; it is not a reasoning-depth
setting or a new API subscription. Browser preferences are stored locally, while
each message's choices are saved as `settings_json` in D1 before the agent runs.
Redelivery and explicit retries retain those original choices. A new message can
switch models without losing the conversation's Codex session.

`shared/chat-settings.mjs` is the shared allowlist, verified with real replies on
Codex 0.159.3 on October 1, 2026. Recheck live access before adding or
retiring models. Do not silently substitute a different model. The runner passes
the model and service tier on both `exec` and `exec resume`; Standard explicitly
resets the tier instead of inheriting a previous Fast setting. Existing messages
without settings and Telegram keep their previous behavior.

The web-chat LaunchAgent pins an Eidos-only Codex installation. Install it with
`npm install --prefix /Users/oasis/.eidos/runtime/codex-0.159.3 --no-audit --no-fund @openai/codex@0.159.3`
before loading the updated plist. This leaves the global Codex binary and Telegram
runner unchanged. Codex 0.144.1 could not run these models. Legacy settings remain
valid for saved turns/retries, but old browser preferences advance to GPT-6.1 Sol;
the picker never offers legacy models.

Existing deployments must apply `apps/api/agent_chat_settings.sql` once before
deploying this Worker. New installations use the updated `agent_chat.sql`.
Install `shared/chat-settings.mjs` and `services/telegram/src/codex-args.ts` with
the updated runner and web-chat adapter on the Mac mini before exposing selectors.

## Attachments

The paperclip, file drop and image paste paths share the same uploader. Limits:
25 MiB per file, 5 files and 50 MiB per message. Supported formats are defined in
`shared/chat-attachments.mjs`: common images (including HEIC), PDF, text/code,
CSV/TSV/JSON, DOCX, XLSX, PPTX and RTF. Executables, archives, legacy binary Office
formats, audio and video are not accepted yet. Uploads have progress, removal and
explicit retry. Ready draft files and pending sends survive a same-tab refresh.

Files upload directly to the Worker using ten-minute, origin-bound, content-hash
bound tickets minted by the authenticated same-origin portal route. This bypasses
Vercel's binary request-size limit. Originals live in the private `eidos-chat-files`
R2 bucket (`CHAT_FILES` binding), with immutable UUID keys and metadata. D1 stores
only attachment references in each turn's `attachments_json`; no file blobs or
upload-progress writes. Repeated sends/retries retain the original files. Download
links require portal authentication, then redirect to a ten-minute file-scoped
ticket. Only raster images can display inline; other downloads use attachment
disposition and no-sniff. Do not enable a public R2 domain for this bucket.

The Mac mini verifies the original's size/hash and caches it under
`data/inbox/web/<uuid>/original.<ext>`. Images are normalized with macOS `sips`
and passed as Codex image inputs, including on resumed sessions. PDF text and up
to three preview pages are prepared automatically with PyMuPDF. The agent can
read/render more pages using the original and the documented helper. Office
files provide text/cells without executing macros/formulas; layout/charts are not
represented in that extraction. Failed extraction is explicitly reported to the
agent, never treated as successful reading. Uploaded content is reference data,
not instructions or executable code. Files are retained, including abandoned
uploads; automatic cleanup is not implemented. Agent-generated output downloads
are a separate future feature.

For existing deployments, apply `apps/api/agent_chat_attachments.sql` once before
the Worker update (new databases use `agent_chat.sql`). Create the private R2
bucket in the configured Cloudflare account. Install the shared attachments
module, `chat-attachments.ts`, `scripts/read_attachment.py`, and updated runner
files together from the committed revision. The reader expects Python at
`/Users/oasis/.eidos/runtime/attachments/bin/python` with the pinned
`scripts/attachments-requirements.txt` installed. The live installation uses an
isolated Python 3.13.12 environment; it does not depend on system/Homebrew Python.

## Delivery behavior

- Each send has an ID created before transmission. Repeating delivery of that ID
  returns the existing turn, preventing a network retry from executing twice.
- Only one turn per conversation can be queued or running. A database constraint
  also enforces this across tabs and devices.
- Queued work survives refreshes and an offline Mac mini. A disconnected running
  turn becomes failed after five minutes without a heartbeat; it is never
  automatically re-executed because the agent may already have taken actions.
- Replies are saved before displaying them. The Mac mini also keeps a temporary
  outbox until Cloudflare acknowledges the completed reply. Conflicted replies
  remain in `data/sessions/web-chat-outbox.json.undelivered-*` for recovery.
- The agent waits for a wake signal when idle. History polling reads incremental
  rows. Heartbeats occur only during active turns; there is no full-history
  delete/rewrite. No new paid model provider is introduced.

### Low-cost wake connections

Chat and Messages jobs use separate instances of `MessageJobWake`. Both accept
authenticated outbound WebSockets from the Mac mini using `state.acceptWebSocket`.
There are no server-side wait timers or pending HTTP long polls. A runtime-managed
`ping`/`pong` auto-response preserves presence through hibernation without waking
the object. Socket attachments and auto-response timestamps survive hibernation;
constructor fields do not. Legacy `/wait` routes return 410 immediately.

The Mac mini owns keepalive, reconnect/backoff and fallback timers. It captures a
wake revision before checking the durable queue, so a notification during that
check cannot be lost. Startup/reconnect drains queued work. A bounded fallback
checks chat every 60 seconds and Messages every 300 seconds even if the wake
channel is unavailable. Wakes are hints only; D1 remains the source of truth,
and wake failure cannot prevent a chat message/reply being persisted.

Deploy Worker and both clients together from a tested commit; no D1 migration is
needed. Install `ws` from the Telegram lockfile and install the Messages-only
`requirements-wake.txt` into `/Users/oasis/.eidos/runtime/message-wake` with the
system Python's pip `--target`. The Messages LaunchAgent adds only that isolated
directory to `PYTHONPATH` inside its loopback SSH command, retaining the existing
Messages database permissions and Python executable. Back up installed files,
restart only these two adapters while idle, then verify a real reply, a Messages
job, Sources/Future, unchanged ingest and per-object duration after idle time.

Do not restore long polling to work around a connection issue: it consumes
billable wall-clock time continuously. Cloudflare's hibernation docs:
https://developers.cloudflare.com/durable-objects/best-practices/websockets/

## Install from a tested, clean commit

1. Run the root build, `npm test` in `apps/api`, and `npm run typecheck` in
   `services/telegram`.
2. Apply the additive migration with `npx wrangler d1 execute eidos --remote
   --file agent_chat.sql` from `apps/api`. Do not replace existing tables.
3. Deploy the Worker from that committed revision with `npm run deploy` in
   `apps/api`. Recheck Sources, Future and unchanged message ingest, as required
   by the repository rules.
4. Compare the Mac mini's installed service files with the repository before
   copying changes. Install the committed `services/telegram/src` changes and
   dependencies into `/Users/oasis/.eidos/services/telegram`, retaining its
   existing `.env` and the Eidos workspace, memory and sessions.
5. Install `services/telegram/launchd/ai.eidos.web-chat.plist` in the Mac mini's
   user LaunchAgents directory and load `ai.eidos.web-chat`. Telegram uses its
   existing separate service. Logs are in `/Users/oasis/.eidos/logs/web-chat.log`
   and `web-chat.err.log`.
6. Push the complete commit to the rebuild branch; Vercel's Git integration
   publishes the preview. The preview already uses branch-scoped
   `EIDOS_WORKER_URL` and `EIDOS_API_TOKEN`. The portal password/session settings
   remain required for any deployment without Vercel's access protection.
7. Verify a real message, a contextual follow-up, refresh, and mobile rendering
   on the preview. A local fixture response is not proof of the live agent.

Normal service startup can also use `npm run start:web`. To stop this adapter,
unload only `ai.eidos.web-chat`; leave the Telegram and Messages services alone.
