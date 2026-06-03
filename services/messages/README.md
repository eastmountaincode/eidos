# Messages Service

Purpose: read iMessage/SMS data from the Mac mini and make it available for search, analytics, check-ins, people context, and history extraction.

First build:

- read `~/Library/Messages/chat.db`
- normalize messages into private Eidos JSON on the Mac mini
- resolve contacts from AddressBook plus persisted aliases
- expose sanitized status to the portal
- never mutate Messages

Current first step:

```sh
python3 ~/.eidos/services/messages/export_messages.py
```

Private output:

- `~/.eidos/data/messages/messages.json`

Portal-safe output:

- `~/.eidos/apps/portal/data/messages-status.json`

Real contact overrides live at `~/.eidos/data/messages/contact-overrides.txt` and should not be committed.

Known hard parts:

- phone/email/handle/group-chat identity resolution
- attributedBody text extraction
- attachment handling
- spam/verification-code filtering
- sync freshness
