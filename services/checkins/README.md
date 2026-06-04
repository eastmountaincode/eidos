# Check-ins Service

Purpose: produce morning and evening check-ins grounded in real inputs.

Schedule:

- morning: 8:30 AM local Mac time
- evening: 8:30 PM local Mac time

Morning:

- today's schedule
- possibly tomorrow's schedule
- upcoming deadlines
- plans made or changed in recent messages
- relevant unresolved loops from recent messages or agent conversations

Evening:

- tomorrow's schedule
- meaningful plans or changes from the day
- unresolved things worth checking back on
- thoughts/events worth adding to history

Judgment:

- Skip trivial transactional messages unless they affect plans.
- Avoid repeating items that have already been handled in a prior check-in.
- It is okay to ask a light follow-up when Andrew recently processed something with the agent and there is a natural open loop.

Not included in first build:

- email
- generic heartbeat content
- old-note churn

Agent-facing command:

```sh
python3 ~/.eidos/services/checkins/send_checkin.py --kind evening --no-send
```

Useful options:

- `--kind morning`
- `--kind evening`
- `--kind auto`
- `--dry-run`
- `--no-send`
- `--force`

Launchd:

```text
~/Library/LaunchAgents/ai.eidos.checkins.plist
```

Run history:

```text
Cloudflare D1: checkin_runs
```

Calendar reader:

```sh
cd ~/.eidos/services/checkins
/usr/bin/swiftc -o calendar_reader calendar_reader.swift
```

If Calendar access is denied, the check-in still runs from messages and recent Eidos notes, but calendar grounding will be incomplete until macOS permission is granted to:

```text
~/.eidos/services/checkins/calendar_reader
```
