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
    parser.add_argument("--limit", type=int, default=25, help="Recent cached messages to include. Use --all for every cached message.")
    parser.add_argument("--all", action="store_true", help="Include every cached message in D1 for the matched conversation.")
    parser.add_argument("--since", default="", help="Only include cached messages at or after this ISO timestamp/date.")
    parser.add_argument("--until", default="", help="Only include cached messages at or before this ISO timestamp/date.")
    parser.add_argument("--offset", type=int, default=0, help="Skip this many matched messages for pagination.")
    parser.add_argument("--order", choices=("asc", "desc"), default="desc", help="Message order from D1.")
    parser.add_argument("--overview-summary", action="store_true", help="Print the latest Messages overview summary instead of fetching one conversation.")
    parser.add_argument("--window-days", type=int, default=30, choices=(7, 30), help="Overview summary window when using --overview-summary.")
    parser.add_argument("--overview-list-limit", default="20", help="Overview summary list size, usually 20 or all.")
    parser.add_argument("--list-limit", default="all", help="Known conversations to scan/list. Use a number or 'all'.")
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


def find_conversation(api_url: str, token: str, person: str, list_limit: str) -> dict[str, Any]:
    data = request_json(api_url, token, f"/api/messages/conversations?{urllib.parse.urlencode({'limit': list_limit})}")
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


def print_conversation_list(api_url: str, token: str, list_limit: str) -> None:
    data = request_json(api_url, token, f"/api/messages/conversations?{urllib.parse.urlencode({'limit': list_limit})}")
    for conversation in data.get("conversations", []):
        name = conversation.get("display_name") or "Unknown"
        key = conversation.get("conversation_key") or ""
        total = conversation.get("message_count") or 0
        sent = conversation.get("sent_count") or 0
        received = conversation.get("received_count") or 0
        last_active = conversation.get("last_active") or "unknown"
        print(f"- {name} ({key}): {total} messages, me {sent}, them {received}, last active {last_active}")


def print_overview_summary(api_url: str, token: str, window_days: int, list_limit: str) -> None:
    query = urllib.parse.urlencode({
        "window_days": window_days,
        "list_limit": list_limit,
    })
    data = request_json(api_url, token, f"/api/messages/view-summary?{query}")
    summary = data.get("summary")
    if not summary:
        print("# Messages Overview Summary")
        print(f"Window: {window_days} days")
        print(f"List: {list_limit}")
        print("No overview summary has been generated yet.")
        return

    print("# Messages Overview Summary")
    print(f"Window: {summary.get('window_days')} days")
    print(f"List: {summary.get('list_limit')}")
    print(f"Status: {summary.get('status')}")
    print(f"Generated: {summary.get('generated_at') or 'not generated'}")
    print(f"Conversations: {summary.get('conversation_count') or 0}")
    print(f"Messages: {summary.get('message_count') or 0}")
    if summary.get("source_start_at") and summary.get("source_end_at"):
        print(f"Range: {summary.get('source_start_at')} to {summary.get('source_end_at')}")
    if summary.get("summary"):
        print(f"\nSummary: {compact(summary.get('summary'))}")
    themes = summary.get("themes") or []
    if themes:
        print("Themes: " + "; ".join(compact(str(theme)) for theme in themes))
    if summary.get("error"):
        print(f"Error: {compact(summary.get('error'))}")


def print_message_context(
    api_url: str,
    token: str,
    person: str,
    limit: int,
    include_all: bool,
    since: str,
    until: str,
    offset: int,
    order: str,
    list_limit: str,
) -> None:
    conversation = find_conversation(api_url, token, person, list_limit)
    query_params = {
        "conversation_key": conversation["conversation_key"],
        "limit": "all" if include_all else max(limit, 1),
        "offset": max(offset, 0),
        "order": order,
    }
    if since:
        query_params["since"] = since
    if until:
        query_params["until"] = until
    query = urllib.parse.urlencode(query_params)
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

    label = "Cached Messages" if include_all else "Recent Messages"
    filters = []
    if since:
        filters.append(f"since {since}")
    if until:
        filters.append(f"until {until}")
    if offset:
        filters.append(f"offset {offset}")
    filter_label = f" ({', '.join(filters)})" if filters else ""
    print(f"\n## {label} ({len(recent)}){filter_label}")
    items = recent if order == "asc" else reversed(recent)
    for item in items:
        direction = "me" if item.get("direction") == "sent" else "them"
        timestamp = item.get("timestamp") or "unknown time"
        body = compact(item.get("body") or "")
        print(f"- {timestamp} {direction}: {body}")


def main() -> None:
    args = parse_args()
    if not args.api_url or not args.api_token:
        raise SystemExit("EIDOS_WORKER_URL and EIDOS_API_TOKEN are required")
    if args.overview_summary:
        print_overview_summary(args.api_url, args.api_token, args.window_days, args.overview_list_limit)
        return
    if args.list:
        print_conversation_list(args.api_url, args.api_token, args.list_limit)
        return
    if not args.person:
        raise SystemExit("--person is required unless --list is used")
    print_message_context(
        args.api_url,
        args.api_token,
        args.person,
        args.limit,
        args.all,
        args.since,
        args.until,
        args.offset,
        args.order,
        args.list_limit,
    )


if __name__ == "__main__":
    main()
