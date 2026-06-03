# Messages Service

Purpose: read iMessage/SMS data from the Mac mini and make it available for search, analytics, check-ins, people context, and history extraction.

First build:

- read `~/Library/Messages/chat.db`
- normalize messages into D1 records
- use R2 for larger message-related blobs/artifacts if needed
- resolve contacts from AddressBook plus persisted aliases
- expose sanitized status to the portal
- never mutate Messages

Current first step:

```sh
python3 ~/.eidos/services/messages/export_messages.py
```

Default output:

- POST normalized message data to the Eidos Cloudflare Worker.
- Worker writes current rolling-window message rows to D1.

Optional debug outputs:

- `--out /path/to/messages.json`
- `--summary-out /path/to/messages-status.json`

JSON files are temporary debug/proof-of-access exports only. The intended durable storage is D1/R2.

Real contact overrides live at `~/.eidos/data/messages/contact-overrides.txt` and should not be committed.

On-demand summaries:

```sh
python3 ~/.eidos/services/messages/process_summary_jobs.py
```

The portal queues a summary request in D1. The Mac mini processor reads queued jobs, extracts the requested conversation window from local `chat.db`, runs `codex exec`, and writes the completed summary back to D1. This is intentionally separate from ingest so summaries are generated only when requested.

Known hard parts:

- phone/email/handle/group-chat identity resolution
- attributedBody text extraction
- attachment handling
- spam/verification-code filtering
- sync freshness
