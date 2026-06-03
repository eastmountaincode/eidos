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

DEFAULT_CODEX_CANDIDATES = (
    "/opt/homebrew/bin/codex",
    "/usr/local/bin/codex",
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
    parser.add_argument("--codex-bin", default=default_codex_bin())
    parser.add_argument("--codex-model", default=os.environ.get("EIDOS_SUMMARY_MODEL", "gpt-5.4-mini"))
    parser.add_argument("--workdir", default=str(eidos_home))
    return parser.parse_args()


def default_codex_bin() -> str:
    found = shutil.which("codex")
    if found:
        return found

    for candidate in DEFAULT_CODEX_CANDIDATES:
        if Path(candidate).exists():
            return candidate

    return "codex"


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


def query_cached_messages(args: argparse.Namespace, job: dict[str, Any]) -> list[dict[str, Any]]:
    limit = int(job.get("message_limit") or 100)
    query = urllib.parse.urlencode({
        "conversation_key": job["conversation_key"],
        "limit": min(max(limit, 1), 200),
    })
    data = request_json(args.api_url, args.api_token, f"/api/messages/conversation?{query}")
    recent = data.get("recentMessages", [])
    messages = [
        {
            "timestamp": item.get("timestamp"),
            "direction": item.get("direction") or "unknown",
            "text": clean_text(item.get("body") or "", 1200),
        }
        for item in recent
        if (item.get("body") or "").strip()
    ]
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

Use the fields this way:
- summary: 3 to 6 sentences about what happened, what the conversation was circling around, and anything Andrew may want to remember.
- themes: 3 to 7 short phrases covering concrete topics, tone, recurring patterns, or notable shifts. Mix topic labels and tone/pattern labels when useful.
- relationship_notes: optional notes about rapport, energy, tension, closeness, distance, logistics, or context Andrew may care about. Leave empty if the transcript does not support a useful note.

Be grounded in the messages. Do not moralize, diagnose, or over-interpret. Do not include private message quotes unless a short phrase is necessary. If the transcript is thin, say that plainly rather than inventing themes.

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
                "--model",
                args.codex_model,
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
            details = {
                "error": "codex exec failed",
                "returncode": result.returncode,
                "codex_bin": args.codex_bin,
                "model": args.codex_model,
                "workdir": str(workdir),
                "stdout_tail": (result.stdout or "").strip()[-1000:],
                "stderr_tail": (result.stderr or "").strip()[-1000:],
            }
            raise RuntimeError(json.dumps(details, ensure_ascii=False))
        return json.loads(output_path.read_text(encoding="utf-8"))


def process_job(args: argparse.Namespace, job: dict[str, Any]) -> dict[str, Any]:
    started_at = datetime.now(tz=timezone.utc).isoformat(timespec="seconds")
    update_summary_job(args, job["id"], {
        "status": "running",
        "started_at": started_at,
        "error": None,
    })
    try:
        try:
            messages = query_messages(Path(args.chat_db).expanduser(), job)
        except Exception:
            messages = query_cached_messages(args, job)
        if not messages:
            raise RuntimeError("no messages matched this summary job")
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
            "model": f"codex exec {args.codex_model}",
            "error": None,
        }
    except Exception as exc:
        payload = {
            "status": "failed",
            "started_at": started_at,
            "error": str(exc),
        }

    return update_summary_job(args, job["id"], payload)


def update_summary_job(args: argparse.Namespace, job_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    return request_json(args.api_url, args.api_token, f"/api/messages/summary-jobs/{urllib.parse.quote(job_id)}", payload)


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
