#!/usr/bin/env python3
"""Read-only iMessage/SMS ingest for Eidos.

Reads chat.db locally and posts normalized message data to the Eidos D1 API.
Optional JSON outputs are for debugging only.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import urllib.error
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

APPLE_EPOCH_OFFSET = 978_307_200


def parse_args() -> argparse.Namespace:
    home = Path.home()
    eidos_home = home / ".eidos"
    return argparse.ArgumentParser(description=__doc__).parse_args([
        *([]),
    ]) if False else build_parser(home, eidos_home).parse_args()


def build_parser(home: Path, eidos_home: Path) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chat-db", default=str(home / "Library/Messages/chat.db"))
    parser.add_argument("--out", default="")
    parser.add_argument("--summary-out", default="")
    parser.add_argument("--overrides", default=str(eidos_home / "data/messages/contact-overrides.txt"))
    parser.add_argument("--api-url", default=os.environ.get("EIDOS_WORKER_URL", ""))
    parser.add_argument("--api-token", default=os.environ.get("EIDOS_API_TOKEN", ""))
    parser.add_argument("--days", type=int, default=30, help="Days to ingest. Use 0 for all available history.")
    parser.add_argument("--recent-limit", type=int, default=100, help="Recent message previews to keep per conversation. Use 0 for all messages in the selected window.")
    parser.add_argument("--conversation-limit", type=int, default=0, help="Conversation analytics to keep. Use 0 for all conversations.")
    parser.add_argument("--preview-len", type=int, default=240)
    return parser


def apple_cutoff_ns(days: int) -> int | None:
    if days <= 0:
        return None
    unix_now = int(datetime.now(tz=timezone.utc).timestamp())
    return (unix_now - APPLE_EPOCH_OFFSET - days * 86_400) * 1_000_000_000


def apple_ns_to_iso(value: int | None) -> str | None:
    if value is None:
        return None
    seconds = value / 1_000_000_000 + APPLE_EPOCH_OFFSET
    return datetime.fromtimestamp(seconds).astimezone().isoformat(timespec="seconds")


def normalize_handle(value: str) -> str:
    return re.sub(r"[^\dA-Za-z@._+-]", "", value or "").lower()


def normalize_phone(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def phone_keys(value: str) -> set[str]:
    digits = normalize_phone(value)
    keys = {digits} if digits else set()
    if len(digits) == 11 and digits.startswith("1"):
        keys.add(digits[-10:])
    return keys


def load_overrides(path: Path) -> dict[str, str]:
    overrides: dict[str, str] = {}
    if not path.exists():
        return overrides
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "|" not in line:
            continue
        raw, name = line.split("|", 1)
        name = name.strip()
        if not name:
            continue
        for key in {normalize_handle(raw), *phone_keys(raw)}:
            if key:
                overrides[key] = name
    return overrides


def address_book_dbs(home: Path) -> list[Path]:
    address_book = home / "Library/Application Support/AddressBook"
    candidates = [
        *address_book.glob("AddressBook-v*.abcddb"),
        *address_book.glob("Sources/*/AddressBook-v*.abcddb"),
    ]
    unique = {db.resolve(): db for db in candidates}
    return sorted(unique.values(), key=lambda p: p.stat().st_mtime, reverse=True)


def load_contacts(home: Path, overrides: dict[str, str]) -> dict[str, str]:
    contacts = dict(overrides)
    for db in address_book_dbs(home):
        try:
            conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
            phone_rows = conn.execute("""
                SELECT p.ZFULLNUMBER, COALESCE(r.ZFIRSTNAME, ''), COALESCE(r.ZLASTNAME, '')
                FROM ZABCDPHONENUMBER p
                JOIN ZABCDRECORD r ON p.ZOWNER = r.Z_PK
                WHERE p.ZFULLNUMBER IS NOT NULL
            """).fetchall()
            email_rows = conn.execute("""
                SELECT e.ZADDRESS, COALESCE(r.ZFIRSTNAME, ''), COALESCE(r.ZLASTNAME, '')
                FROM ZABCDEMAILADDRESS e
                JOIN ZABCDRECORD r ON e.ZOWNER = r.Z_PK
                WHERE e.ZADDRESS IS NOT NULL
            """).fetchall()
        except sqlite3.Error:
            continue
        finally:
            try:
                conn.close()
            except Exception:
                pass

        for number, first, last in phone_rows:
            name = f"{first} {last}".strip()
            for key in phone_keys(number):
                if key and name and key not in contacts:
                    contacts[key] = name
        for email, first, last in email_rows:
            name = f"{first} {last}".strip()
            key = normalize_handle(email)
            if key and name and key not in contacts:
                contacts[key] = name
    return contacts


def extract_attributed_text(blob: bytes | None) -> str | None:
    if not blob:
        return None
    try:
        data = bytes(blob)
        idx = data.find(b"NSString")
        if idx < 0:
            return None
        rest = data[idx:]
        plus_idx = rest.find(b"+")
        if plus_idx < 0 or plus_idx + 2 >= len(rest):
            return None
        length = rest[plus_idx + 1]
        start = plus_idx + 2
        text = rest[start:start + length].decode("utf-8", errors="replace").strip()
        return text or None
    except Exception:
        return None


def clean_text(text: str, max_len: int) -> str:
    text = re.sub(r"\s+", " ", text.replace("\ufffc", "")).strip()
    return text[:max_len]


def resolve_handle_label(handle: str, contacts: dict[str, str]) -> str:
    for key in (normalize_handle(handle), *phone_keys(handle)):
        if key and key in contacts:
            return contacts[key]
    return handle or "Unknown"


def resolve_group_label(group_name: str, participant_handles: str, contacts: dict[str, str]) -> str:
    if group_name.strip():
        return group_name.strip()

    labels: list[str] = []
    seen: set[str] = set()
    for handle in [part for part in participant_handles.split("\x1f") if part]:
        label = resolve_handle_label(handle, contacts)
        key = label.lower()
        if key in seen:
            continue
        seen.add(key)
        labels.append(label)

    if not labels:
        return "Unnamed group"

    visible = labels[:4]
    suffix = f" +{len(labels) - len(visible)}" if len(labels) > len(visible) else ""
    return f"Group: {', '.join(visible)}{suffix}"


def resolve_contact(handle: str, group_name: str, participant_handles: str, chat_type: str, contacts: dict[str, str]) -> str:
    if chat_type == "group":
        return resolve_group_label(group_name, participant_handles, contacts)
    return resolve_handle_label(handle, contacts)


def connect_readonly(path: Path) -> sqlite3.Connection:
    return sqlite3.connect(f"file:{path}?mode=ro", uri=True)


def export_messages(args: argparse.Namespace) -> tuple[dict[str, Any], dict[str, Any]]:
    chat_db = Path(args.chat_db).expanduser()
    out_path = Path(args.out).expanduser() if args.out else None
    summary_path = Path(args.summary_out).expanduser() if args.summary_out else None
    overrides_path = Path(args.overrides).expanduser()

    if not chat_db.exists():
        raise FileNotFoundError(f"Messages database not found: {chat_db}")

    contacts = load_contacts(Path.home(), load_overrides(overrides_path))
    cutoff = apple_cutoff_ns(args.days)
    date_filter = "AND m.date > ?" if cutoff is not None else ""
    date_params = (cutoff,) if cutoff is not None else ()
    recent_rank_filter = "WHERE conversation_rank <= ?" if args.recent_limit > 0 else ""
    recent_rank_params = (args.recent_limit,) if args.recent_limit > 0 else ()
    stat_limit_clause = "LIMIT ?" if args.conversation_limit > 0 else ""
    stat_limit_params = (args.conversation_limit,) if args.conversation_limit > 0 else ()
    conn = connect_readonly(chat_db)
    conn.row_factory = sqlite3.Row

    recent_rows = conn.execute(f"""
        SELECT *
        FROM (
            SELECT
                m.ROWID AS id,
                m.date,
                COALESCE(h.id, CASE WHEN c.style = 43 THEN '' ELSE c.chat_identifier END, '') AS handle,
                COALESCE(m.service, h.service, '') AS service,
                m.is_from_me,
                m.text,
                m.attributedBody,
                COALESCE(c.display_name, '') AS group_name,
                COALESCE(c.chat_identifier, '') AS chat_identifier,
                COALESCE((
                    SELECT GROUP_CONCAT(h2.id, char(31))
                    FROM chat_handle_join chj2
                    JOIN handle h2 ON h2.ROWID = chj2.handle_id
                    WHERE chj2.chat_id = c.ROWID
                ), '') AS participant_handles,
                CASE WHEN c.style = 43 THEN 'group' ELSE 'direct' END AS chat_type,
                ROW_NUMBER() OVER (
                    PARTITION BY CASE WHEN c.style = 43 THEN COALESCE(c.chat_identifier, c.display_name, 'Unknown') ELSE COALESCE(h.id, c.chat_identifier, 'Unknown') END
                    ORDER BY m.date DESC
                ) AS conversation_rank
            FROM message m
            LEFT JOIN handle h ON m.handle_id = h.ROWID
            LEFT JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
            LEFT JOIN chat c ON cmj.chat_id = c.ROWID
            WHERE (m.text IS NOT NULL AND m.text != '' OR m.attributedBody IS NOT NULL)
              {date_filter}
        )
        {recent_rank_filter}
        ORDER BY date DESC
    """, (*date_params, *recent_rank_params)).fetchall()

    stat_rows = conn.execute(f"""
        SELECT
            CASE WHEN c.style = 43 THEN COALESCE(c.chat_identifier, c.display_name, 'Unknown') ELSE COALESCE(h.id, c.chat_identifier, 'Unknown') END AS handle,
            COALESCE(c.display_name, '') AS group_name,
            COALESCE((
                SELECT GROUP_CONCAT(h2.id, char(31))
                FROM chat_handle_join chj2
                JOIN handle h2 ON h2.ROWID = chj2.handle_id
                WHERE chj2.chat_id = c.ROWID
            ), '') AS participant_handles,
            COALESCE(m.service, h.service, '') AS service,
            CASE WHEN c.style = 43 THEN 'group' ELSE 'direct' END AS chat_type,
            COUNT(*) AS message_count,
            SUM(CASE WHEN m.is_from_me = 1 THEN 1 ELSE 0 END) AS sent_count,
            SUM(CASE WHEN m.is_from_me = 0 THEN 1 ELSE 0 END) AS received_count,
            MAX(m.date) AS last_date
        FROM message m
        LEFT JOIN handle h ON m.handle_id = h.ROWID
        LEFT JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
        LEFT JOIN chat c ON cmj.chat_id = c.ROWID
        WHERE (m.text IS NOT NULL AND m.text != '' OR m.attributedBody IS NOT NULL)
          {date_filter}
        GROUP BY CASE WHEN c.style = 43 THEN COALESCE(c.chat_identifier, c.display_name, 'Unknown') ELSE COALESCE(h.id, c.chat_identifier, 'Unknown') END,
                 COALESCE(c.display_name, '')
        ORDER BY message_count DESC
        {stat_limit_clause}
    """, (*date_params, *stat_limit_params)).fetchall()

    total = conn.execute(f"""
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN is_from_me = 1 THEN 1 ELSE 0 END) AS sent,
            SUM(CASE WHEN is_from_me = 0 THEN 1 ELSE 0 END) AS received,
            MAX(date) AS last_date
        FROM message
        WHERE (text IS NOT NULL AND text != '' OR attributedBody IS NOT NULL)
          {"AND date > ?" if cutoff is not None else ""}
    """, date_params).fetchone()
    conn.close()

    service_counts: Counter[str] = Counter()
    recent: list[dict[str, Any]] = []
    for row in recent_rows:
        text = row["text"] or extract_attributed_text(row["attributedBody"]) or ""
        if not text.strip():
            continue
        handle = row["handle"] or row["chat_identifier"] or ""
        contact = resolve_contact(handle, row["group_name"], row["participant_handles"], row["chat_type"], contacts)
        service = row["service"] or "unknown"
        service_counts[service] += 1
        recent.append({
            "id": row["id"],
            "timestamp": apple_ns_to_iso(row["date"]),
            "contact": contact,
            "handle": handle,
            "direction": "sent" if row["is_from_me"] else "received",
            "service": service,
            "chat_type": row["chat_type"],
            "preview": clean_text(text, args.preview_len),
        })

    conversations = []
    for row in stat_rows:
        handle = row["handle"] or ""
        contact = resolve_contact(handle, row["group_name"], row["participant_handles"], row["chat_type"], contacts)
        conversations.append({
            "contact": contact,
            "handle": handle,
            "service": row["service"] or "unknown",
            "chat_type": row["chat_type"],
            "message_count": row["message_count"],
            "sent_count": row["sent_count"] or 0,
            "received_count": row["received_count"] or 0,
            "last_active": apple_ns_to_iso(row["last_date"]),
        })

    exported_at = datetime.now().astimezone().isoformat(timespec="seconds")
    private_payload = {
        "exported_at": exported_at,
        "source": str(chat_db),
        "window_days": args.days,
        "stats": {
            "total_messages": total["total"] or 0,
            "sent_messages": total["sent"] or 0,
            "received_messages": total["received"] or 0,
            "last_message_at": apple_ns_to_iso(total["last_date"]),
            "services_in_recent_export": dict(service_counts),
            "conversation_count": len(conversations),
        },
        "conversations": conversations,
        "recent_messages": recent,
    }

    summary_payload = {
        "exported_at": exported_at,
        "status": "active",
        "source": "~/Library/Messages/chat.db",
        "window_days": args.days,
        "stats": {
            "total_messages": private_payload["stats"]["total_messages"],
            "sent_messages": private_payload["stats"]["sent_messages"],
            "received_messages": private_payload["stats"]["received_messages"],
            "last_message_at": private_payload["stats"]["last_message_at"],
            "conversation_count": private_payload["stats"]["conversation_count"],
            "services_in_recent_export": dict(service_counts),
        },
        "note": "Messages are read locally on the Mac mini and written to D1.",
    }

    if args.api_url and args.api_token:
        post_to_api(args.api_url, args.api_token, private_payload)

    if out_path:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(private_payload, indent=2, ensure_ascii=False))
        os.chmod(out_path, 0o600)

    if summary_path:
        summary_path.parent.mkdir(parents=True, exist_ok=True)
        summary_path.write_text(json.dumps(summary_payload, indent=2, ensure_ascii=False))

    return private_payload, summary_payload


def post_to_api(api_url: str, token: str, payload: dict[str, Any]) -> None:
    url = api_url.rstrip("/") + "/api/messages/ingest"
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "Eidos/0.1",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            if response.status >= 300:
                raise RuntimeError(f"API returned HTTP {response.status}")
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"API returned HTTP {err.code}: {detail}") from err


def main() -> None:
    private_payload, summary_payload = export_messages(parse_args())
    print(json.dumps({
        "status": summary_payload["status"],
        "exported_at": summary_payload["exported_at"],
        "total_messages": summary_payload["stats"]["total_messages"],
        "conversation_count": summary_payload["stats"]["conversation_count"],
        "last_message_at": summary_payload["stats"]["last_message_at"],
        "recent_messages_exported": len(private_payload["recent_messages"]),
        "storage": "d1" if os.environ.get("EIDOS_WORKER_URL") else "local-only",
    }, indent=2))


if __name__ == "__main__":
    main()
