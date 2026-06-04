#!/usr/bin/env python3
"""Send scheduled Eidos morning/evening check-ins to Telegram."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import tempfile
import urllib.parse
import urllib.request
from datetime import datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any


DEFAULT_CODEX_CANDIDATES = (
    "/opt/homebrew/bin/codex",
    "/usr/local/bin/codex",
)


def parse_args() -> argparse.Namespace:
    eidos_home = Path.home() / ".eidos"
    load_env_file(eidos_home / ".env")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kind", choices=("auto", "morning", "evening"), default="auto")
    parser.add_argument("--api-url", default=os.environ.get("EIDOS_WORKER_URL", ""))
    parser.add_argument("--api-token", default=os.environ.get("EIDOS_API_TOKEN", ""))
    parser.add_argument("--telegram-token", default=os.environ.get("TELEGRAM_BOT_TOKEN", ""))
    parser.add_argument("--telegram-chat-id", default=os.environ.get("TELEGRAM_CHAT_ID", ""))
    parser.add_argument("--codex-bin", default=default_codex_bin())
    parser.add_argument("--codex-model", default=os.environ.get("EIDOS_CHECKIN_MODEL", os.environ.get("CODEX_MODEL", "gpt-5.4-mini")))
    parser.add_argument("--workdir", default=str(Path(os.environ.get("EIDOS_HOME", eidos_home)).expanduser()))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--no-send", action="store_true")
    parser.add_argument("--force", action="store_true", help="Send even if this check-in kind already ran recently.")
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


def post_telegram(token: str, chat_id: str, text: str) -> dict[str, Any]:
    request = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=json.dumps({
            "chat_id": chat_id,
            "text": text[:3900],
            "disable_web_page_preview": True,
        }).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json", "User-Agent": "Eidos/0.1"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def determine_kind(value: str) -> str:
    if value != "auto":
        return value
    return "morning" if datetime.now().hour < 12 else "evening"


def iso_now() -> str:
    return datetime.now(tz=timezone.utc).isoformat(timespec="seconds")


def local_iso(value: datetime) -> str:
    return value.astimezone().isoformat(timespec="seconds")


def check_window(kind: str) -> tuple[datetime, datetime]:
    now = datetime.now().astimezone()
    tomorrow = now.date() + timedelta(days=1)
    if kind == "morning":
        end = datetime.combine(tomorrow, time(23, 59)).astimezone()
    else:
        end = datetime.combine(tomorrow, time(23, 59)).astimezone()
    return now, end


def recent_duplicate(args: argparse.Namespace, kind: str) -> dict[str, Any] | None:
    query = urllib.parse.urlencode({"kind": kind, "limit": 4})
    data = request_json(args.api_url, args.api_token, f"/api/checkins/runs?{query}")
    cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=10)
    for run in data.get("runs", []):
        if run.get("status") != "completed":
            continue
        started = parse_iso(run.get("started_at") or run.get("completed_at") or "")
        if started and started > cutoff:
            return run
    return None


def parse_iso(value: str) -> datetime | None:
    if not value:
        return None
    normalized = value.replace(" ", "T")
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    if "+" not in normalized[-6:] and normalized[-1:] != "Z":
        normalized += "+00:00"
    try:
        return datetime.fromisoformat(normalized).astimezone(timezone.utc)
    except ValueError:
        return None


def read_calendar_context(start: datetime, end: datetime) -> dict[str, Any]:
    script_path = Path(__file__).with_name("calendar_reader.swift")
    binary_path = Path(__file__).with_name("calendar_reader")
    applications_binary_path = Path.home() / "Applications/EidosCalendarReader.app/Contents/MacOS/calendar_reader"
    app_binary_path = Path(__file__).with_name("EidosCalendarReader.app") / "Contents/MacOS/calendar_reader"
    if applications_binary_path.exists():
        command = [str(applications_binary_path)]
    elif app_binary_path.exists():
        command = [str(app_binary_path)]
    elif binary_path.exists():
        command = [str(binary_path)]
    else:
        command = ["/usr/bin/swift", str(script_path)]
    command.extend([
        "--start-epoch",
        str(start.timestamp()),
        "--end-epoch",
        str(end.timestamp()),
    ])
    try:
        result = subprocess.run(command, check=False, capture_output=True, text=True, timeout=45)
    except subprocess.TimeoutExpired:
        return {"error": "Calendar reader timed out.", "events": []}
    if result.returncode != 0:
        return {"error": (result.stderr or result.stdout).strip(), "events": []}
    try:
        return json.loads(result.stdout or "{}")
    except json.JSONDecodeError:
        return {"error": "Calendar reader returned invalid JSON.", "events": []}


def compact(value: str, max_len: int = 280) -> str:
    cleaned = " ".join(str(value or "").split())
    return cleaned[:max_len]


def truncate(value: str, max_len: int) -> str:
    return str(value or "").strip()[:max_len]


def read_message_context(args: argparse.Namespace) -> dict[str, Any]:
    overview = request_json(args.api_url, args.api_token, "/api/messages/overview?window_days=7")
    conversations = overview.get("topConversations", [])[:8]
    enriched = []
    for conversation in conversations:
        key = conversation.get("conversation_key")
        if not key:
            continue
        query = urllib.parse.urlencode({"conversation_key": key, "limit": 6})
        detail = request_json(args.api_url, args.api_token, f"/api/messages/conversation?{query}")
        completed_summaries = [
            summary for summary in detail.get("summaries", [])
            if summary.get("status") == "completed"
        ]
        enriched.append({
            "display_name": conversation.get("display_name"),
            "message_count_7d": conversation.get("message_count"),
            "me_7d": conversation.get("sent_count"),
            "them_7d": conversation.get("received_count"),
            "last_active": conversation.get("last_active"),
            "latest_summary": summarize_existing_summary(completed_summaries[0]) if completed_summaries else None,
            "recent_messages": [
                {
                    "timestamp": item.get("timestamp"),
                    "direction": "me" if item.get("direction") == "sent" else "them",
                    "body": compact(item.get("body") or "", 220),
                }
                for item in reversed(detail.get("recentMessages", []))
                if item.get("body")
            ],
        })
    return {
        "latest_run": overview.get("latestRun"),
        "conversations": enriched,
    }


def summarize_existing_summary(summary: dict[str, Any]) -> dict[str, Any]:
    return {
        "generated_at": summary.get("generated_at"),
        "window_type": summary.get("window_type"),
        "message_count": summary.get("message_count"),
        "summary": compact(summary.get("summary") or "", 320),
        "themes": summary.get("themes") or [],
        "relationship_notes": compact(summary.get("relationship_notes") or "", 220),
    }


def read_agent_notes(workdir: Path) -> dict[str, Any]:
    notes: dict[str, Any] = {}
    for relative in ("profiles/personal/HISTORY.md", "profiles/personal/MEMORY.md"):
        path = workdir / relative
        if not path.exists():
            continue
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        notes[relative] = "\n".join(lines[-80:])
    return notes


def run_codex(args: argparse.Namespace, kind: str, context: dict[str, Any]) -> dict[str, Any]:
    if not shutil.which(args.codex_bin) and not Path(args.codex_bin).exists():
        raise RuntimeError("codex CLI not found")

    schema = {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "body": {"type": "string"},
        },
        "required": ["title", "body"],
        "additionalProperties": False,
    }
    prompt = f"""Write Andrew's {kind} Eidos check-in for Telegram.

Use the available calendar, recent message, previous check-in, and agent-note context below.

Rules:
- This is not a heartbeat. Only mention things that are useful to surface.
- Morning: focus on today's schedule, possibly tomorrow, upcoming deadlines, plans made in messages, and open loops.
- Evening: focus on tomorrow, meaningful plans or changes from today, and unresolved loops worth checking back on.
- Skip trivial transactional texts unless they affect plans.
- Do not mention that a data source is unavailable unless it materially limits the check-in.
- Be concise: usually 3 to 6 bullets or short paragraphs.
- Avoid fake certainty. If something is a guess from context, say so lightly.
- Return `body` as the exact Telegram message text. Do not include Markdown tables.

Context JSON:
{json.dumps(context, ensure_ascii=False, indent=2)}
"""

    with tempfile.TemporaryDirectory() as tmp:
        schema_path = Path(tmp) / "checkin-schema.json"
        output_path = Path(tmp) / "checkin.json"
        schema_path.write_text(json.dumps(schema), encoding="utf-8")
        workdir = Path(args.workdir).expanduser()
        workdir.mkdir(parents=True, exist_ok=True)
        child_env = {
            **os.environ,
            "PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:" + os.environ.get("PATH", ""),
        }
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
                "Create a structured Eidos check-in from the provided context.",
            ],
            input=prompt,
            text=True,
            capture_output=True,
            cwd=str(workdir),
            env=child_env,
            timeout=300,
            check=False,
        )
        if result.returncode != 0:
            details = {
                "error": "codex exec failed",
                "returncode": result.returncode,
                "codex_bin": args.codex_bin,
                "model": args.codex_model,
                "stdout_tail": (result.stdout or "").strip()[-1000:],
                "stderr_tail": (result.stderr or "").strip()[-1000:],
            }
            raise RuntimeError(json.dumps(details, ensure_ascii=False))
        return json.loads(output_path.read_text(encoding="utf-8"))


def create_or_update_run(args: argparse.Namespace, payload: dict[str, Any]) -> dict[str, Any]:
    return request_json(args.api_url, args.api_token, "/api/checkins/runs", payload)


def main() -> None:
    args = parse_args()
    if not args.api_url or not args.api_token:
        raise SystemExit("EIDOS_WORKER_URL and EIDOS_API_TOKEN are required")

    kind = determine_kind(args.kind)
    if not args.force:
        duplicate = recent_duplicate(args, kind)
        if duplicate:
            print(json.dumps({"status": "skipped", "reason": "recent duplicate", "run": duplicate}, indent=2))
            return

    started_at = iso_now()
    run = create_or_update_run(args, {
        "kind": kind,
        "status": "running",
        "started_at": started_at,
    }).get("run", {})
    run_id = run.get("id")

    try:
        start, end = check_window(kind)
        workdir = Path(args.workdir).expanduser()
        calendar_context = read_calendar_context(start, end)
        message_context = read_message_context(args)
        previous_query = urllib.parse.urlencode({"limit": 4})
        previous = request_json(args.api_url, args.api_token, f"/api/checkins/runs?{previous_query}").get("runs", [])
        context = {
            "kind": kind,
            "generated_at": local_iso(datetime.now().astimezone()),
            "calendar_window": {"start": local_iso(start), "end": local_iso(end)},
            "calendar": calendar_context,
            "messages": message_context,
            "previous_checkins": [
                {
                    "kind": item.get("kind"),
                    "completed_at": item.get("completed_at"),
                    "body": compact(item.get("body") or "", 500),
                }
                for item in previous
                if item.get("status") == "completed"
            ],
            "agent_notes": read_agent_notes(workdir),
        }
        result = run_codex(args, kind, context)
        body = truncate(result.get("body") or "", 3900)
        title = compact(result.get("title") or f"Eidos {kind} check-in", 160)
        if args.dry_run or args.no_send:
            telegram_result = {"sent": False}
        else:
            if not args.telegram_token or not args.telegram_chat_id:
                raise RuntimeError("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required to send check-ins")
            telegram_result = post_telegram(args.telegram_token, args.telegram_chat_id, body)

        completed_payload = {
            "id": run_id,
            "kind": kind,
            "status": "skipped" if args.dry_run or args.no_send else "completed",
            "completed_at": iso_now(),
            "title": title,
            "body": body,
            "calendar_context": calendar_context,
            "message_context": message_context,
            "model": f"codex exec {args.codex_model}",
            "error": None,
        }
        updated = create_or_update_run(args, completed_payload)
        print(json.dumps({"run": updated.get("run"), "telegram": telegram_result}, indent=2))
    except Exception as exc:
        failed_payload = {
            "id": run_id,
            "kind": kind,
            "status": "failed",
            "completed_at": iso_now(),
            "error": str(exc),
        }
        updated = create_or_update_run(args, failed_payload) if run_id else {}
        print(json.dumps({"error": str(exc), "run": updated.get("run")}, indent=2))
        raise


if __name__ == "__main__":
    main()
