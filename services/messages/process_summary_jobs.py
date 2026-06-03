#!/usr/bin/env python3
"""Process queued message summary jobs for Eidos.

Runs on the Mac mini because that is where the full Messages database lives.
The portal queues jobs in D1; this script reads the relevant local messages,
invokes Codex on demand, and writes the summary back to D1.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sqlite3
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from export_messages import (
    APPLE_EPOCH_OFFSET,
    apple_cutoff_ns,
    apple_ns_to_iso,
    clean_text,
    connect_readonly,
    extract_attributed_text,
)


def parse_args() -> argparse.Namespace:
    home = Path.home()
    eidos_home = home / ".eidos"
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chat-db", default=str(home / "Library/Messages/chat.db"))
    parser.add_argument("--api-url", default=os.environ.get("EIDOS_WORKER_URL", ""))
    parser.add_argument("--api-token", default=os.environ.get("EIDOS_API_TOKEN", ""))
    parser.add_argument("--limit", type=int, default=1)
    parser.add_argument("--preview", action="store_true", help="Print queued jobs without processing.")
    parser.add_argument("--codex-bin", default=shutil.which("codex") or "codex")
    parser.add_argument("--workdir", default=str(eidos_home))
    return parser.parse_args()


def request_json(api_url: str, token: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    method = "POST" if payload is not None else "GET"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
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
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def key_for_conversation(raw: str) -> str:
    return re.sub(r"[^a-z0-9@._+-]+", "_", (raw or "unknown").lower())[:180] or "unknown"


def query_messages(chat_db: Path, job: dict[str, Any]) -> list[dict[str, Any]]:
    if not chat_db.exists():
        raise FileNotFoundError(f"Messages database not found: {chat_db}")

    conversation_key = job["conversation_key"]
    message_limit = job.get("message_limit")
    window_days = job.get("window_days")
    cutoff_clause = ""
    params: list[Any] = []
    if window_days:
      cutoff_clause = "AND m.date > ?"
      params.append(apple_cutoff_ns(int(window_days)))

    limit = max(int(message_limit or 5000), 100)
    params.append(limit)

    conn = connect_readonly(chat_db)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(f"""
        SELECT
            m.ROWID AS id,
            m.date,
            COALESCE(h.id, CASE WHEN c.style = 43 THEN '' ELSE c.chat_identifier END, '') AS handle,
            m.is_from_me,
            m.text,
            m.attributedBody,
            COALESCE(c.chat_identifier, '') AS chat_identifier,
            CASE WHEN c.style = 43 THEN 'group' ELSE 'direct' END AS chat_type
        FROM message m
        LEFT JOIN handle h ON m.handle_id = h.ROWID
        LEFT JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
        LEFT JOIN chat c ON cmj.chat_id = c.ROWID
        WHERE (m.text IS NOT NULL AND m.text != '' OR m.attributedBody IS NOT NULL)
          {cutoff_clause}
        ORDER BY m.date DESC
        LIMIT ?
    """, params).fetchall()
    conn.close()

    messages: list[dict[str, Any]] = []
    for row in rows:
        raw_handle = row["chat_identifier"] if row["chat_type"] == "group" else row["handle"]
        if key_for_conversation(raw_handle) != conversation_key:
            continue
        text = row["text"] or extract_attributed_text(row["attributedBody"]) or ""
        if not text.strip():
            continue
        messages.append({
            "timestamp": apple_ns_to_iso(row["date"]),
            "direction": "sent" if row["is_from_me"] else "received",
            "text": clean_text(text, 1200),
        })
        if message_limit and len(messages) >= int(message_limit):
            break

    return list(reversed(messages))


def run_codex(args: argparse.Namespace, job: dict[str, Any], messages: list[dict[str, Any]]) -> dict[str, Any]:
    if not shutil.which(args.codex_bin) and not Path(args.codex_bin).exists():
        raise RuntimeError("codex CLI not found")

    schema = {
        "type": "object",
        "properties": {
            "summary": {"type": "string"},
            "themes": {"type": "array", "items": {"type": "string"}},
            "relationship_notes": {"type": "string"},
        },
        "required": ["summary", "themes", "relationship_notes"],
        "additionalProperties": False,
    }

    transcript = "\n".join(
        f"{item['timestamp']} {item['direction']}: {item['text']}" for item in messages
    )
    prompt = f"""Summarize this private message conversation for Andrew.

Conversation: {job.get('display_name') or job.get('conversation_key')}
Window: {job.get('window_type')}

Return:
- a concise recent thread summary
- 3 to 7 themes
- relationship notes only if useful; otherwise an empty string

Do not moralize. Do not include private message quotes unless a short phrase is necessary.

Transcript:
{transcript}
"""

    with tempfile.TemporaryDirectory() as tmp:
        schema_path = Path(tmp) / "summary-schema.json"
        output_path = Path(tmp) / "summary.json"
        schema_path.write_text(json.dumps(schema), encoding="utf-8")
        workdir = Path(args.workdir).expanduser()
        workdir.mkdir(parents=True, exist_ok=True)
        result = subprocess.run(
            [
                args.codex_bin,
                "exec",
                "--skip-git-repo-check",
                "--sandbox",
                "read-only",
                "--output-schema",
                str(schema_path),
                "-o",
                str(output_path),
                "Create a structured summary from the provided message transcript.",
            ],
            input=prompt,
            text=True,
            capture_output=True,
            cwd=str(workdir),
            timeout=300,
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError((result.stderr or result.stdout or "codex exec failed").strip()[-2000:])
        return json.loads(output_path.read_text(encoding="utf-8"))


def process_job(args: argparse.Namespace, job: dict[str, Any]) -> dict[str, Any]:
    started_at = datetime.now(tz=timezone.utc).isoformat(timespec="seconds")
    try:
        messages = query_messages(Path(args.chat_db).expanduser(), job)
        if not messages:
            raise RuntimeError("no local messages matched this summary job")
        result = run_codex(args, job, messages)
        payload = {
            "status": "completed",
            "started_at": started_at,
            "generated_at": datetime.now(tz=timezone.utc).isoformat(timespec="seconds"),
            "message_count": len(messages),
            "source_start_at": messages[0]["timestamp"],
            "source_end_at": messages[-1]["timestamp"],
            "summary": result.get("summary", ""),
            "themes": result.get("themes", []),
            "relationship_notes": result.get("relationship_notes", ""),
            "model": "codex exec",
            "error": None,
        }
    except Exception as exc:
        payload = {
            "status": "failed",
            "started_at": started_at,
            "error": str(exc),
        }

    return request_json(args.api_url, args.api_token, f"/api/messages/summary-jobs/{urllib.parse.quote(job['id'])}", payload)


def main() -> None:
    args = parse_args()
    if not args.api_url or not args.api_token:
        raise SystemExit("EIDOS_WORKER_URL and EIDOS_API_TOKEN are required")

    data = request_json(args.api_url, args.api_token, f"/api/messages/summary-jobs?status=queued&limit={args.limit}")
    jobs = data.get("jobs", [])
    if args.preview:
        print(json.dumps({"jobs": jobs}, indent=2))
        return

    results = [process_job(args, job) for job in jobs]
    print(json.dumps({"processed": len(results), "results": results}, indent=2))


if __name__ == "__main__":
    main()
