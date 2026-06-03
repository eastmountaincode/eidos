#!/usr/bin/env python3
"""Fetch compact message context from Eidos D1 for agent use."""

from __future__ import annotations

import argparse
import json
import os
import re
import urllib.parse
import urllib.request
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-url", default=os.environ.get("EIDOS_WORKER_URL", ""))
    parser.add_argument("--api-token", default=os.environ.get("EIDOS_API_TOKEN", ""))
    parser.add_argument("--person", default="", help="Name, phone number, or handle to look up.")
    parser.add_argument("--limit", type=int, default=25, help="Recent messages to include, max 100.")
    parser.add_argument("--list", action="store_true", help="List known conversations instead of fetching one.")
    return parser.parse_args()


def request_json(api_url: str, token: str, path: str) -> dict[str, Any]:
    request = urllib.request.Request(
        f"{api_url.rstrip('/')}{path}",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "Eidos/0.1",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def compact(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def conversation_score(query: str, conversation: dict[str, Any]) -> int:
    query_norm = normalize(query)
    if not query_norm:
        return 0

    haystacks = [
        normalize(str(conversation.get("display_name") or "")),
        normalize(str(conversation.get("handle") or "")),
        normalize(str(conversation.get("conversation_key") or "")),
    ]
    score = 0
    for haystack in haystacks:
        if haystack == query_norm:
            score = max(score, 100)
        elif query_norm and query_norm in haystack:
            score = max(score, 80)
        else:
            query_terms = [term for term in query_norm.split() if len(term) >= 3]
            if query_terms and all(term in haystack for term in query_terms):
                score = max(score, 60)
            elif query_terms and any(term in haystack for term in query_terms):
                score = max(score, 30)
    return score


def find_conversation(api_url: str, token: str, person: str) -> dict[str, Any]:
    data = request_json(api_url, token, "/api/messages/conversations?limit=100")
    conversations = data.get("conversations", [])
    ranked = [
        (conversation_score(person, conversation), conversation)
        for conversation in conversations
    ]
    ranked = [item for item in ranked if item[0] > 0]
    ranked.sort(key=lambda item: (item[0], item[1].get("message_count") or 0), reverse=True)
    if not ranked:
        raise SystemExit(f"No message conversation matched: {person}")
    return ranked[0][1]


def print_conversation_list(api_url: str, token: str) -> None:
    data = request_json(api_url, token, "/api/messages/conversations?limit=100")
    for conversation in data.get("conversations", []):
        name = conversation.get("display_name") or "Unknown"
        key = conversation.get("conversation_key") or ""
        total = conversation.get("message_count") or 0
        sent = conversation.get("sent_count") or 0
        received = conversation.get("received_count") or 0
        last_active = conversation.get("last_active") or "unknown"
        print(f"- {name} ({key}): {total} messages, me {sent}, them {received}, last active {last_active}")


def print_message_context(api_url: str, token: str, person: str, limit: int) -> None:
    conversation = find_conversation(api_url, token, person)
    query = urllib.parse.urlencode({
        "conversation_key": conversation["conversation_key"],
        "limit": min(max(limit, 1), 100),
    })
    detail = request_json(api_url, token, f"/api/messages/conversation?{query}")
    summaries = [
        summary for summary in detail.get("summaries", [])
        if summary.get("status") == "completed"
    ]
    latest_summary = summaries[0] if summaries else None
    recent = detail.get("recentMessages", [])

    print("# Message Context")
    print(f"Person: {conversation.get('display_name')}")
    print(f"Conversation key: {conversation.get('conversation_key')}")
    print(f"Window messages: {conversation.get('message_count')}")
    print(f"Me: {conversation.get('sent_count')} | Them: {conversation.get('received_count')}")
    print(f"Last active: {conversation.get('last_active')}")

    if latest_summary:
        print("\n## Latest Summary")
        print(f"Generated: {latest_summary.get('generated_at')}")
        print(f"Corpus: {latest_summary.get('window_type')}")
        print(f"Messages in summary: {latest_summary.get('message_count')}")
        if latest_summary.get("source_start_at") and latest_summary.get("source_end_at"):
            print(f"Range: {latest_summary.get('source_start_at')} to {latest_summary.get('source_end_at')}")
        if latest_summary.get("summary"):
            print(f"Summary: {compact(latest_summary.get('summary'))}")
        themes = latest_summary.get("themes") or []
        if themes:
            print("Themes: " + "; ".join(compact(str(theme)) for theme in themes))
        if latest_summary.get("relationship_notes"):
            print(f"Relationship notes: {compact(latest_summary.get('relationship_notes'))}")

    print(f"\n## Recent Messages ({len(recent)})")
    for item in reversed(recent):
        direction = "me" if item.get("direction") == "sent" else "them"
        timestamp = item.get("timestamp") or "unknown time"
        body = compact(item.get("body") or "")
        print(f"- {timestamp} {direction}: {body}")


def main() -> None:
    args = parse_args()
    if not args.api_url or not args.api_token:
        raise SystemExit("EIDOS_WORKER_URL and EIDOS_API_TOKEN are required")
    if args.list:
        print_conversation_list(args.api_url, args.api_token)
        return
    if not args.person:
        raise SystemExit("--person is required unless --list is used")
    print_message_context(args.api_url, args.api_token, args.person, args.limit)


if __name__ == "__main__":
    main()
