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

Selective write rule: save things Andrew would plausibly want to see later on the Memory page. Do not save routine agent chores, generic status updates, or calendar/message facts that were not meaningful in context.
