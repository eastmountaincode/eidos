# Calendar Service

Purpose: add events to Andrew's Apple Calendar from structured event details.

Current permission state: the tool is installed, but macOS Calendar permission must be granted to:

```text
~/Applications/EidosCalendarWriter.app
```

Default calendar:

```text
Events Ambient
```

Use `Events Ambient` for events Andrew may attend or wants visible on the calendar. Only use a different calendar when Andrew explicitly names one.

Agent-facing command:

```sh
python3 ~/.eidos/services/calendar/add_event.py \
  --title "Event name" \
  --start "2026-06-12 19:00" \
  --location "Venue name"
```

Useful options:

- `--calendar "Events Ambient"`
- `--end "2026-06-12 22:00"`
- `--duration-minutes 90`
- `--all-day`
- `--notes "Context or source text"`
- `--url "https://example.com/event"`
- `--list-calendars`
- `--dry-run`

Screenshot workflow:

1. Extract event title, date, time, location, and source URL/details from the screenshot or caption.
2. Ask a short clarification only if date/time/title is ambiguous enough that writing the calendar would likely be wrong.
3. Call `add_event.py`, defaulting to `Events Ambient`.
4. Return the created calendar, title, start/end, and location.

After changing or testing this tool, update the capability registry:

```sh
python3 ~/.eidos/services/skills/update_capability.py --id "calendar-events"
```

Build the signed helper app:

```sh
cd ~/.eidos/services/calendar
mkdir -p ~/Applications/EidosCalendarWriter.app/Contents/MacOS
cp CalendarWriter-Info.plist ~/Applications/EidosCalendarWriter.app/Contents/Info.plist
/usr/bin/swiftc \
  -Xlinker -sectcreate \
  -Xlinker __TEXT \
  -Xlinker __info_plist \
  -Xlinker CalendarWriter-Info.plist \
  -o ~/Applications/EidosCalendarWriter.app/Contents/MacOS/calendar_event_writer \
  calendar_event_writer.swift
codesign --force --deep --sign - ~/Applications/EidosCalendarWriter.app
```
