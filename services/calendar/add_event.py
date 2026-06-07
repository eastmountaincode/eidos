#!/usr/bin/env python3
"""Add an event to Apple Calendar for Eidos."""

from __future__ import annotations

import argparse
import json
import subprocess
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any


DEFAULT_CALENDAR = "Events Ambient"
DEFAULT_DURATION_MINUTES = 120
EVENTKIT_TIMEOUT_SECONDS = 30


@dataclass
class CalendarEvent:
    title: str
    calendar: str
    start: datetime
    end: datetime
    location: str
    notes: str
    url: str
    all_day: bool


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--calendar", default=DEFAULT_CALENDAR, help=f"Calendar name. Default: {DEFAULT_CALENDAR}.")
    parser.add_argument("--title", default="", help="Event title.")
    parser.add_argument("--start", default="", help="Start date/time, e.g. '2026-06-12 19:00'.")
    parser.add_argument("--end", default="", help="End date/time. Defaults to --duration-minutes after start.")
    parser.add_argument("--duration-minutes", type=int, default=DEFAULT_DURATION_MINUTES)
    parser.add_argument("--all-day", action="store_true", help="Create an all-day event.")
    parser.add_argument("--location", default="")
    parser.add_argument("--notes", default="")
    parser.add_argument("--url", default="")
    parser.add_argument("--list-calendars", action="store_true", help="List available Apple Calendar names.")
    parser.add_argument("--dry-run", action="store_true", help="Print the event payload without writing Calendar.")
    return parser.parse_args()


def parse_datetime(value: str, *, end_of_day: bool = False) -> datetime:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError("missing datetime")

    normalized = cleaned.replace("T", " ")
    if normalized.endswith("Z"):
        normalized = normalized[:-1]
    if len(normalized) >= 6 and normalized[-6] in "+-" and normalized[-3] == ":":
        normalized = normalized[:-6]

    formats = [
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
        "%m/%d/%Y %H:%M",
        "%m/%d/%Y",
        "%B %d, %Y %H:%M",
        "%B %d, %Y",
        "%b %d, %Y %H:%M",
        "%b %d, %Y",
    ]
    for fmt in formats:
        try:
            parsed = datetime.strptime(normalized, fmt)
            if "%H" not in fmt:
                return parsed.replace(hour=23, minute=59) if end_of_day else parsed
            return parsed
        except ValueError:
            continue

    raise ValueError(f"could not parse datetime: {value!r}")


def event_from_args(args: argparse.Namespace) -> CalendarEvent:
    title = args.title.strip()
    if not title:
        raise SystemExit("--title is required unless --list-calendars is used")
    if not args.start.strip():
        raise SystemExit("--start is required unless --list-calendars is used")

    start = parse_datetime(args.start)
    if args.all_day:
        end = parse_datetime(args.end, end_of_day=True) if args.end.strip() else start.replace(hour=23, minute=59)
    elif args.end.strip():
        end = parse_datetime(args.end)
    else:
        duration = max(args.duration_minutes, 1)
        end = start + timedelta(minutes=duration)

    if end <= start and not args.all_day:
        raise SystemExit("--end must be after --start")

    return CalendarEvent(
        title=title,
        calendar=args.calendar.strip() or DEFAULT_CALENDAR,
        start=start,
        end=end,
        location=args.location.strip(),
        notes=args.notes.strip(),
        url=args.url.strip(),
        all_day=bool(args.all_day),
    )


def writer_command(args: list[str]) -> list[str]:
    script_path = Path(__file__).with_name("calendar_event_writer.swift")
    binary_path = Path(__file__).with_name("calendar_event_writer")
    applications_binary_path = Path.home() / "Applications/EidosCalendarWriter.app/Contents/MacOS/calendar_event_writer"
    app_binary_path = Path(__file__).with_name("EidosCalendarWriter.app") / "Contents/MacOS/calendar_event_writer"
    if applications_binary_path.exists():
        return [str(applications_binary_path), *args]
    if app_binary_path.exists():
        return [str(app_binary_path), *args]
    if binary_path.exists():
        return [str(binary_path), *args]
    return ["/usr/bin/swift", str(script_path), *args]


def run_writer(args: list[str]) -> dict[str, Any]:
    command = writer_command(args)
    try:
        result = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=EVENTKIT_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired as exc:
        raise SystemExit(
            "Timed out talking to Apple Calendar through EventKit. The Mac mini may need Calendar permission for the Eidos calendar tool."
        ) from exc
    if result.returncode != 0:
        output = result.stderr.strip() or result.stdout.strip() or f"calendar writer failed with {result.returncode}"
        if "Calendar access denied" in output:
            raise SystemExit(
                f"{output}\nGrant Calendar access to ~/Applications/EidosCalendarWriter.app on the Mac mini."
            )
        raise SystemExit(output)
    return json.loads(result.stdout or "{}")


def list_calendars() -> list[str]:
    data = run_writer(["--list-calendars"])
    return [str(name) for name in data.get("calendars", [])]


def add_event(event: CalendarEvent) -> dict[str, Any]:
    writer_args = [
        "--calendar", event.calendar,
        "--title", event.title,
        "--start-epoch", str(event.start.timestamp()),
        "--end-epoch", str(event.end.timestamp()),
    ]
    if event.location:
        writer_args.extend(["--location", event.location])
    if event.notes:
        writer_args.extend(["--notes", event.notes])
    if event.url:
        writer_args.extend(["--url", event.url])
    if event.all_day:
        writer_args.append("--all-day")

    data = run_writer(writer_args)
    return payload(event, uid=str(data.get("uid") or ""), status="created")


def payload(event: CalendarEvent, *, status: str, uid: str = "") -> dict[str, Any]:
    return {
        "status": status,
        "calendar": event.calendar,
        "title": event.title,
        "start": event.start.isoformat(timespec="minutes"),
        "end": event.end.isoformat(timespec="minutes"),
        "all_day": event.all_day,
        "location": event.location,
        "notes": event.notes,
        "url": event.url,
        "uid": uid,
    }


def main() -> None:
    args = parse_args()
    if args.list_calendars:
        print(json.dumps({"calendars": list_calendars()}, indent=2))
        return

    event = event_from_args(args)
    if args.dry_run:
        print(json.dumps(payload(event, status="dry_run"), indent=2))
        return

    print(json.dumps(add_event(event), indent=2))


if __name__ == "__main__":
    main()
