# Skills Service

Purpose: maintain a visible, testable inventory of Eidos capabilities.

First skills to model:

- meeting/audio transcription from a file
- image to Apple Music playlist
- invoice generation
- iMessage/SMS ingest
- calendar event creation
- calendar check-in
- portal status

Each skill should have:

- name
- summary
- examples
- input/output shape
- last tested timestamp
- status: ready, needs_test, broken, planned

After changing a tool or skill implementation, prompt instructions, private config, or tested status, update its D1 registry row so the portal `Updated` timestamp remains meaningful:

```sh
python3 ~/.eidos/services/skills/update_capability.py --id "invoice-generator"
```

Pass `--notes`, `--summary`, `--status`, or other metadata fields when the visible registry text should change too.

Initial Telegram inventory:

- `telegram-chat`: active
- `file-intake`: active
- `messages-ingest`: active
- `invoice-generator`: active
- `calendar-events`: active
- `capability-registry`: active
- `calendar-checkins`: planned
- `meeting-transcription`: planned
- `playlist-from-image`: planned
