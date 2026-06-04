#!/usr/bin/env python3
"""Update or touch an Eidos tool/skill registry row in D1."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any
import urllib.parse
import urllib.request


def parse_args() -> argparse.Namespace:
    eidos_home = Path.home() / ".eidos"
    load_env_file(eidos_home / ".env")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-url", default=os.environ.get("EIDOS_WORKER_URL", ""))
    parser.add_argument("--api-token", default=os.environ.get("EIDOS_API_TOKEN", ""))
    parser.add_argument("--id", required=True, help="Capability id, e.g. invoice-generator.")
    parser.add_argument("--name", default="")
    parser.add_argument("--status", default="")
    parser.add_argument("--category", default="")
    parser.add_argument("--summary", default="")
    parser.add_argument("--invocation", default="")
    parser.add_argument("--data-source", default="")
    parser.add_argument("--notes", default="")
    parser.add_argument("--sort-order", type=int, default=None)
    return parser.parse_args()


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


def request_json(api_url: str, token: str, capability_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    request = urllib.request.Request(
        f"{api_url.rstrip('/')}/api/capabilities/{urllib.parse.quote(capability_id)}",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "Eidos/0.1",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def payload_from_args(args: argparse.Namespace) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    for attr, field in (
        ("name", "name"),
        ("status", "status"),
        ("category", "category"),
        ("summary", "summary"),
        ("invocation", "invocation"),
        ("data_source", "data_source"),
        ("notes", "notes"),
    ):
        value = getattr(args, attr)
        if value:
            payload[field] = value
    if args.sort_order is not None:
        payload["sort_order"] = args.sort_order
    return payload


def main() -> None:
    args = parse_args()
    if not args.api_url or not args.api_token:
        raise SystemExit("EIDOS_WORKER_URL and EIDOS_API_TOKEN are required")

    result = request_json(args.api_url, args.api_token, args.id, payload_from_args(args))
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
