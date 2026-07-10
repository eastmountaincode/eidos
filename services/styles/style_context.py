#!/usr/bin/env python3
"""Read and write Eidos style repository entries in D1."""

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
    parser.add_argument("--list", action="store_true", help="List recent style entries.")
    parser.add_argument("--add", action="store_true", help="Add or update a style entry.")
    parser.add_argument("--id", default="", help="Stable entry id for upsert.")
    parser.add_argument("--source-text", default="", help="Raw source phrase, reference, object, or effect name.")
    parser.add_argument("--kind", default="", help="Entry kind, e.g. text-effect, loader, image, component.")
    parser.add_argument("--url", default="", help="Source URL.")
    parser.add_argument("--captured-at", default="", help="Capture date or timestamp.")
    parser.add_argument("--context", default="", help="Why this style matters or where Andrew found it.")
    parser.add_argument("--notes", default="", help="Implementation notes, description, or reproduction detail.")
    parser.add_argument("--tags", default="", help="Comma-separated tags.")
    parser.add_argument("--file-path", default="", help="Local file path for a saved reference document/image.")
    parser.add_argument("--limit", type=int, default=50, help="Number of entries to list.")
    parser.add_argument("--json", action="store_true", help="Print raw JSON.")
    return parser.parse_args()


def compact(value: str) -> str:
    return " ".join((value or "").split())


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


def list_entries(args: argparse.Namespace) -> None:
    params = urllib.parse.urlencode({"limit": max(args.limit, 1)})
    data = request_json(args.api_url, args.api_token, f"/api/styles?{params}")
    if args.json:
        print(json.dumps(data, indent=2))
        return

    print("# Eidos Style")
    entries = data.get("entries", [])
    if not entries:
        print("No style entries yet.")
        return

    for entry in entries:
        tags = ", ".join(entry.get("tags") or [])
        suffix = f" [{tags}]" if tags else ""
        print(f"- {entry.get('source_text')} ({entry.get('kind') or 'style'}){suffix}")
        detail = compact(entry.get("context") or entry.get("notes") or "")
        if detail:
            print(f"  {detail}")
        if entry.get("url"):
            print(f"  URL: {entry.get('url')}")
        if entry.get("file_path"):
            print(f"  File: {entry.get('file_path')}")


def add_entry(args: argparse.Namespace) -> None:
    if not compact(args.source_text):
      raise SystemExit("--source-text is required with --add")

    payload: dict[str, Any] = {
        "source_text": compact(args.source_text),
        "kind": compact(args.kind),
        "url": compact(args.url),
        "captured_at": compact(args.captured_at),
        "context": compact(args.context),
        "notes": compact(args.notes),
        "tags": compact(args.tags),
        "file_path": compact(args.file_path),
    }
    if args.id:
        payload["id"] = compact(args.id)

    data = request_json(args.api_url, args.api_token, "/api/styles", method="POST", payload=payload)
    if args.json:
        print(json.dumps(data, indent=2))
        return

    entry = data.get("entry") or {}
    print(f"Saved style entry: {entry.get('source_text')}")


def main() -> None:
    args = parse_args()
    if not args.api_url or not args.api_token:
        raise SystemExit("EIDOS_WORKER_URL and EIDOS_API_TOKEN are required")

    if args.add:
        add_entry(args)
    else:
        list_entries(args)


if __name__ == "__main__":
    main()
