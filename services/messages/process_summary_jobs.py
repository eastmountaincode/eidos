#!/usr/bin/env python3
"""Process queued message jobs for Eidos.

Runs on the Mac mini because that is where the full Messages database lives.
The portal queues jobs in D1; this script handles explicit ingest requests and
on-demand summaries from the local Messages database.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import signal
import sqlite3
import subprocess
import sys
import tempfile
import time
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
    export_messages,
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
    parser.add_argument("--daemon", action="store_true", help="Keep running and process queued jobs as wake events arrive.")
    parser.add_argument("--wait-timeout", type=int, default=300, help="Seconds before renewing the job wake wait request.")
    parser.add_argument("--error-retry-interval", type=int, default=30, help="Seconds to wait after a worker error before reconnecting.")
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


def codex_child_env() -> dict[str, str]:
    child_env = {
        **os.environ,
        "PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:" + os.environ.get("PATH", ""),
    }
    child_env.pop("CODEX_API_KEY", None)
    child_env.pop("OPENAI_API_KEY", None)
    return child_env


def request_json(
    api_url: str,
    token: str,
    path: str,
    payload: dict[str, Any] | None = None,
    timeout: int = 60,
) -> dict[str, Any]:
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
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def key_for_conversation(raw: str) -> str:
    return re.sub(r"[^a-z0-9@._+-]+", "_", (raw or "unknown").lower())[:180] or "unknown"


def conversation_identifiers(job: dict[str, Any]) -> list[str]:
    identifiers = {
        str(job.get("conversation_key") or ""),
        str(job.get("handle") or ""),
    }
    for value in list(identifiers):
        digits = re.sub(r"\D", "", value)
        if digits:
            identifiers.add(digits)
            identifiers.add(f"+{digits}")
    return sorted(identifier for identifier in identifiers if identifier)


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

    identifiers = conversation_identifiers(job)
    identifier_placeholders = ", ".join("?" for _ in identifiers)
    conversation_clause = ""
    if identifiers:
        conversation_clause = f"AND (h.id IN ({identifier_placeholders}) OR c.chat_identifier IN ({identifier_placeholders}))"
        params.extend([*identifiers, *identifiers])

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
          {conversation_clause}
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


def query_latest_messages(chat_db: Path, job: dict[str, Any], limit: int = 100) -> list[dict[str, Any]]:
    fallback_job = {
        **job,
        "window_days": None,
        "message_limit": limit,
        "_source_note": "The requested time window had no matching messages, so this uses the latest available local messages for the conversation.",
    }
    return query_messages(chat_db, fallback_job)


def query_cached_messages(args: argparse.Namespace, job: dict[str, Any]) -> list[dict[str, Any]]:
    limit = int(job.get("message_limit") or 100)
    query = urllib.parse.urlencode({
        "conversation_key": job["conversation_key"],
        "limit": max(limit, 1),
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

    other_person = job.get("display_name") or job.get("conversation_key") or "the other person"

    def speaker_label(item: dict[str, Any]) -> str:
        if item.get("direction") == "sent":
            return "Andrew"
        if item.get("direction") == "received":
            return str(other_person)
        return "Unknown speaker"

    transcript = "\n".join(
        f"{item['timestamp']} {speaker_label(item)}: {item['text']}" for item in messages
    )
    prompt = f"""Summarize this private message conversation for Andrew.

Conversation: Andrew and {other_person}
Window: {job.get('window_type')}
Source note: {job.get('_source_note') or 'Messages matched the requested window.'}

Speaker labels are authoritative:
- `Andrew:` means Andrew sent that message.
- `{other_person}:` means the other person sent that message.
- Never attribute something Andrew said to {other_person}, or something {other_person} said to Andrew.

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
            env=codex_child_env(),
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
        chat_db = Path(args.chat_db).expanduser()
        try:
            messages = query_messages(chat_db, job)
            if not messages and job.get("window_days"):
                fallback_messages = query_latest_messages(chat_db, job)
                if fallback_messages:
                    job = {
                        **job,
                        "_source_note": "The requested time window had no matching messages, so this summary uses the latest available local messages for the conversation.",
                    }
                    messages = fallback_messages
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


def process_ingest_request(args: argparse.Namespace, request: dict[str, Any]) -> dict[str, Any]:
    request_id = request["id"]
    update_ingest_request(args, request_id, {
        "status": "running",
        "error": None,
    })

    try:
        ingest_args = argparse.Namespace(
            chat_db=args.chat_db,
            out="",
            summary_out="",
            overrides=str(Path.home() / ".eidos/data/messages/contact-overrides.txt"),
            api_url=args.api_url,
            api_token=args.api_token,
            days=30,
            recent_limit=100,
            conversation_limit=0,
            preview_len=240,
        )
        export_messages(ingest_args)
        payload = {
            "status": "completed",
            "completed_at": datetime.now(tz=timezone.utc).isoformat(timespec="seconds"),
            "error": None,
        }
    except Exception as exc:
        payload = {
            "status": "failed",
            "completed_at": datetime.now(tz=timezone.utc).isoformat(timespec="seconds"),
            "error": str(exc),
        }

    return update_ingest_request(args, request_id, payload)


def update_ingest_request(args: argparse.Namespace, request_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    return request_json(args.api_url, args.api_token, f"/api/messages/ingest-requests/{urllib.parse.quote(request_id)}", payload)


def process_queued_jobs(args: argparse.Namespace) -> dict[str, Any]:
    ingest_data = request_json(args.api_url, args.api_token, "/api/messages/ingest-requests?status=queued&limit=1")
    ingest_requests = ingest_data.get("requests", [])
    summary_data = request_json(args.api_url, args.api_token, f"/api/messages/summary-jobs?status=queued&limit={args.limit}")
    summary_jobs = summary_data.get("jobs", [])

    ingest_results = [process_ingest_request(args, request) for request in ingest_requests]
    summary_results = [process_job(args, job) for job in summary_jobs]
    return {
        "ingests_processed": len(ingest_results),
        "summaries_processed": len(summary_results),
        "ingest_results": ingest_results,
        "summary_results": summary_results,
    }


def wait_for_job_wake(args: argparse.Namespace) -> dict[str, Any]:
    timeout = min(max(int(args.wait_timeout), 1), 300)
    query = urllib.parse.urlencode({"timeout": timeout})
    return request_json(
        args.api_url,
        args.api_token,
        f"/api/messages/jobs/wait?{query}",
        timeout=timeout + 15,
    )


def run_daemon(args: argparse.Namespace) -> None:
    stopped = False

    def stop(_signum: int, _frame: Any) -> None:
        nonlocal stopped
        stopped = True

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    print(json.dumps({
        "event": "message_worker_started",
        "mode": "event_driven",
        "wait_timeout": args.wait_timeout,
        "limit": args.limit,
        "started_at": datetime.now(tz=timezone.utc).isoformat(timespec="seconds"),
    }), flush=True)

    while not stopped:
        try:
            result = process_queued_jobs(args)
            if result["ingests_processed"] or result["summaries_processed"]:
                print(json.dumps({
                    "event": "jobs_processed",
                    "processed_at": datetime.now(tz=timezone.utc).isoformat(timespec="seconds"),
                    **result,
                }, indent=2), flush=True)
                continue

            wake = wait_for_job_wake(args)
            if wake.get("woken"):
                print(json.dumps({
                    "event": "job_wake_received",
                    **wake,
                }), flush=True)
        except Exception as exc:
            print(json.dumps({
                "event": "message_worker_error",
                "error": str(exc),
                "occurred_at": datetime.now(tz=timezone.utc).isoformat(timespec="seconds"),
            }), file=sys.stderr, flush=True)
            time.sleep(max(int(args.error_retry_interval), 1))

    print(json.dumps({
        "event": "message_worker_stopped",
        "stopped_at": datetime.now(tz=timezone.utc).isoformat(timespec="seconds"),
    }), flush=True)


def main() -> None:
    args = parse_args()
    if not args.api_url or not args.api_token:
        raise SystemExit("EIDOS_WORKER_URL and EIDOS_API_TOKEN are required")

    if args.preview:
        ingest_data = request_json(args.api_url, args.api_token, "/api/messages/ingest-requests?status=queued&limit=1")
        summary_data = request_json(args.api_url, args.api_token, f"/api/messages/summary-jobs?status=queued&limit={args.limit}")
        print(json.dumps({
            "ingest_requests": ingest_data.get("requests", []),
            "summary_jobs": summary_data.get("jobs", []),
        }, indent=2))
        return

    if args.daemon:
        run_daemon(args)
        return

    print(json.dumps(process_queued_jobs(args), indent=2))


if __name__ == "__main__":
    main()
