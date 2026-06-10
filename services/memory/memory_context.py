#!/usr/bin/env python3
"""Read and write Eidos memory entries in D1 for agent use."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any
import urllib.parse
import urllib.request


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("\"'")
        if key and key not in os.environ:
            os.environ[key] = value


def parse_args() -> argparse.Namespace:
    load_env_file(Path.home() / ".eidos" / ".env")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-url", default=os.environ.get("EIDOS_WORKER_URL", ""))
    parser.add_argument("--api-token", default=os.environ.get("EIDOS_API_TOKEN", ""))
    parser.add_argument("--recent", action="store_true", help="Show recent history dates and the active date entries.")
    parser.add_argument("--date", default="", help="History date to read or write, as YYYY-MM-DD.")
    parser.add_argument("--limit", type=int, default=20, help="Number of history dates to list when reading.")
    parser.add_argument("--add-history", action="store_true", help="Write a daily history entry.")
    parser.add_argument("--add-note", action="store_true", help="Write a durable profile memory note.")
    parser.add_argument("--add-person-note", action="store_true", help="Write a durable person-specific memory note.")
    parser.add_argument("--id", default="", help="Optional stable id for upserting an existing history entry.")
    parser.add_argument("--profile", default="personal", choices=("personal", "creative", "bioinformatics"), help="Profile for durable memory notes.")
    parser.add_argument("--person", default="", help="Person name for person-specific memory notes.")
    parser.add_argument("--title", default="", help="History entry title.")
    parser.add_argument("--body", default="", help="History entry body.")
    parser.add_argument("--source-type", default="agent", help="Source type, e.g. agent, messages, checkin, calendar.")
    parser.add_argument("--source-label", default="", help="Human-readable source label.")
    parser.add_argument("--source-ref", default="", help="Optional source reference id or URL.")
    parser.add_argument("--json", action="store_true", help="Print raw JSON from the Worker.")
    return parser.parse_args()


def request_json(api_url: str, token: str, path: str, method: str = "GET", payload: dict[str, Any] | None = None) -> dict[str, Any]:
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")

    request = urllib.request.Request(
        f"{api_url.rstrip('/')}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "Eidos/0.1",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def compact(value: str) -> str:
    return " ".join((value or "").split())


def read_memory(args: argparse.Namespace) -> None:
    params: dict[str, str | int] = {"limit": max(args.limit, 1)}
    if args.date:
        params["date"] = args.date
    data = request_json(args.api_url, args.api_token, f"/api/memory?{urllib.parse.urlencode(params)}")
    if args.json:
        print(json.dumps(data, indent=2))
        return

    print("# Eidos Memory")
    active_date = data.get("activeDate") or "none"
    print(f"Active date: {active_date}")

    dates = data.get("dates", [])
    if dates:
        print("\n## Recent Dates")
        for item in dates:
            print(f"- {item.get('entry_date')}: {item.get('entry_count')} entries, updated {item.get('updated_at')}")
    else:
        print("\nNo history dates yet.")

    entries = data.get("entries", [])
    if entries:
        print("\n## Entries")
        for entry in entries:
            source = entry.get("source_label") or entry.get("source_type") or "unknown source"
            print(f"- {entry.get('title')} ({source})")
            print(f"  {compact(entry.get('body') or '')}")
    elif args.date:
        print(f"\nNo history entries for {args.date}.")

    notes = data.get("memoryNotes", [])
    if notes:
        print("\n## Persistent Memory")
        for note in notes:
            source = note.get("source_label") or note.get("source_type") or "unknown source"
            print(f"- {note.get('title')} [{note.get('profile')}] ({source})")
            print(f"  {compact(note.get('body') or '')}")

    people_notes = data.get("peopleNotes", [])
    if people_notes:
        print("\n## People Notes")
        for note in people_notes:
            source = note.get("source_label") or note.get("source_type") or "unknown source"
            print(f"- {note.get('person_name')} ({source})")
            print(f"  {compact(note.get('body') or '')}")


def write_history(args: argparse.Namespace) -> None:
    if not args.date:
        raise SystemExit("--date is required with --add-history")
    if not compact(args.title):
        raise SystemExit("--title is required with --add-history")
    if not compact(args.body):
        raise SystemExit("--body is required with --add-history")

    payload: dict[str, Any] = {
        "entry_date": args.date,
        "title": compact(args.title),
        "body": compact(args.body),
        "source_type": compact(args.source_type),
        "source_label": compact(args.source_label),
        "source_ref": compact(args.source_ref),
    }
    if args.id:
        payload["id"] = args.id

    data = request_json(args.api_url, args.api_token, "/api/memory/history", method="POST", payload=payload)
    if args.json:
        print(json.dumps(data, indent=2))
        return

    entry = data.get("entry") or {}
    print(f"Saved history entry: {entry.get('entry_date')} - {entry.get('title')}")


def write_note(args: argparse.Namespace) -> None:
    if not compact(args.title):
        raise SystemExit("--title is required with --add-note")
    if not compact(args.body):
        raise SystemExit("--body is required with --add-note")

    payload: dict[str, Any] = {
        "profile": compact(args.profile),
        "title": compact(args.title),
        "body": compact(args.body),
        "source_type": compact(args.source_type),
        "source_label": compact(args.source_label),
        "source_ref": compact(args.source_ref),
    }
    if args.id:
        payload["id"] = args.id

    data = request_json(args.api_url, args.api_token, "/api/memory/notes", method="POST", payload=payload)
    if args.json:
        print(json.dumps(data, indent=2))
        return

    note = data.get("note") or {}
    print(f"Saved persistent memory note: {note.get('profile')} - {note.get('title')}")


def write_person_note(args: argparse.Namespace) -> None:
    if not compact(args.person):
        raise SystemExit("--person is required with --add-person-note")
    if not compact(args.body):
        raise SystemExit("--body is required with --add-person-note")

    payload: dict[str, Any] = {
        "person_name": compact(args.person),
        "body": compact(args.body),
        "source_type": compact(args.source_type),
        "source_label": compact(args.source_label),
        "source_ref": compact(args.source_ref),
    }
    if args.id:
        payload["id"] = args.id

    data = request_json(args.api_url, args.api_token, "/api/memory/people", method="POST", payload=payload)
    if args.json:
        print(json.dumps(data, indent=2))
        return

    note = data.get("note") or {}
    print(f"Saved person memory note: {note.get('person_name')}")


def main() -> None:
    args = parse_args()
    if not args.api_url or not args.api_token:
        raise SystemExit("EIDOS_WORKER_URL and EIDOS_API_TOKEN are required")

    if args.add_history:
        write_history(args)
    elif args.add_note:
        write_note(args)
    elif args.add_person_note:
        write_person_note(args)
    else:
        read_memory(args)


if __name__ == "__main__":
    main()
