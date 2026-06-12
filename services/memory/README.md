# Memory Context

Agent-facing D1 memory tool.

Read recent history:

```sh
python3 ~/.eidos/services/memory/memory_context.py --recent
```

Read a specific date:

```sh
python3 ~/.eidos/services/memory/memory_context.py --date 2026-06-07
```

Write a daily history entry:

```sh
python3 ~/.eidos/services/memory/memory_context.py --add-history --date 2026-06-07 --title "Title" --body "Short grounded note."
```

Write durable profile memory:

```sh
python3 ~/.eidos/services/memory/memory_context.py --add-note --profile personal --title "Home address" --body "Durable fact."
```

Write person-specific memory:

```sh
python3 ~/.eidos/services/memory/memory_context.py --add-person-note --person "Name" --body "Durable relationship/context note."
```

Selective write rule: save things Andrew would plausibly want to see later on the Memory page. Daily history is for dated events or conversations. Persistent memory is for durable facts, preferences, stable personal context, and people notes. Do not save routine agent chores, generic status updates, calendar/message facts that were not meaningful in context, or contact-resolution facts like mapping a phone number to a name.
