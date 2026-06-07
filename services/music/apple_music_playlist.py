#!/usr/bin/env python3
"""Create Apple Music playlists and add library tracks."""

from __future__ import annotations

import argparse
import json
import subprocess
from dataclasses import dataclass
from typing import Any


SCRIPT_TIMEOUT_SECONDS = 60


@dataclass
class SongRequest:
    title: str
    artist: str

    @property
    def query(self) -> str:
        return " ".join(part for part in (self.title, self.artist) if part).strip()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--playlist", default="", help="Playlist name to create or update.")
    parser.add_argument("--song", action="append", default=[], help='Song to add as "Title|Artist". Repeat for multiple songs.')
    parser.add_argument("--create-only", action="store_true", help="Create the playlist without adding songs.")
    parser.add_argument("--list-playlists", action="store_true", help="List Apple Music playlists.")
    parser.add_argument("--search", default="", help="Search the Music library without modifying playlists.")
    parser.add_argument("--json", action="store_true", help="Print raw JSON.")
    return parser.parse_args()


def run_applescript(script: str, args: list[str] | None = None) -> str:
    command = ["/usr/bin/osascript", "-e", script]
    if args:
        command.extend(args)
    result = subprocess.run(
        command,
        check=False,
        capture_output=True,
        text=True,
        timeout=SCRIPT_TIMEOUT_SECONDS,
    )
    if result.returncode != 0:
        raise SystemExit(result.stderr.strip() or result.stdout.strip() or f"osascript failed with {result.returncode}")
    return result.stdout.strip()


def list_playlists() -> list[str]:
    output = run_applescript(
        """
        tell application "Music"
          set playlistNames to name of every user playlist
          set AppleScript's text item delimiters to linefeed
          return playlistNames as text
        end tell
        """
    )
    return [line for line in output.splitlines() if line.strip()]


def create_playlist(name: str) -> None:
    run_applescript(
        """
        on run argv
          set playlistName to item 1 of argv
          tell application "Music"
            if not (exists playlist playlistName) then
              make new user playlist with properties {name:playlistName}
            end if
          end tell
        end run
        """,
        [name],
    )


def search_library(query: str) -> list[dict[str, str]]:
    if not query.strip():
        return []
    output = run_applescript(
        """
        on run argv
          set queryText to item 1 of argv
          tell application "Music"
            set foundTracks to search library playlist 1 for queryText
            set rows to {}
            repeat with foundTrack in foundTracks
              set trackName to ""
              set trackArtist to ""
              set trackAlbum to ""
              set trackPersistentId to ""
              try
                set trackName to name of foundTrack as text
              end try
              try
                set trackArtist to artist of foundTrack as text
              end try
              try
                set trackAlbum to album of foundTrack as text
              end try
              try
                set trackPersistentId to persistent ID of foundTrack as text
              end try
              set end of rows to trackPersistentId & tab & trackName & tab & trackArtist & tab & trackAlbum
            end repeat
            set AppleScript's text item delimiters to linefeed
            return rows as text
          end tell
        end run
        """,
        [query],
    )
    tracks = []
    for line in output.splitlines():
        persistent_id, title, artist, album = (line.split("\t") + ["", "", "", ""])[:4]
        if persistent_id:
            tracks.append({"persistent_id": persistent_id, "title": title, "artist": artist, "album": album})
    return tracks


def score_track(request: SongRequest, track: dict[str, str]) -> int:
    title = normalize(track.get("title", ""))
    artist = normalize(track.get("artist", ""))
    requested_title = normalize(request.title)
    requested_artist = normalize(request.artist)

    score = 0
    if requested_title and title == requested_title:
        score += 80
    elif requested_title and requested_title in title:
        score += 55
    elif requested_title and all(part in title for part in requested_title.split()):
        score += 35

    if requested_artist and artist == requested_artist:
        score += 60
    elif requested_artist and requested_artist in artist:
        score += 35
    elif requested_artist and all(part in artist for part in requested_artist.split()):
        score += 20

    return score


def normalize(value: str) -> str:
    return " ".join(value.lower().split())


def best_match(request: SongRequest) -> dict[str, str] | None:
    tracks = search_library(request.query)
    if not tracks:
        return None
    scored = sorted(((score_track(request, track), track) for track in tracks), key=lambda item: item[0], reverse=True)
    if scored[0][0] <= 0:
        return None
    return scored[0][1]


def add_track(playlist: str, persistent_id: str) -> None:
    run_applescript(
        """
        on run argv
          set playlistName to item 1 of argv
          set targetPersistentId to item 2 of argv
          tell application "Music"
            if not (exists playlist playlistName) then
              make new user playlist with properties {name:playlistName}
            end if
            set sourceTrack to first track of library playlist 1 whose persistent ID is targetPersistentId
            duplicate sourceTrack to playlist playlistName
          end tell
        end run
        """,
        [playlist, persistent_id],
    )


def parse_song(raw: str) -> SongRequest:
    parts = [part.strip() for part in raw.split("|", 1)]
    if len(parts) == 1:
        return SongRequest(title=parts[0], artist="")
    return SongRequest(title=parts[0], artist=parts[1])


def print_result(result: dict[str, Any], raw_json: bool) -> None:
    if raw_json:
        print(json.dumps(result, indent=2))
        return

    if result["status"] == "searched":
        print(f"Library search: {result['query']}")
        for track in result["tracks"]:
            print(f"- {track['title']} - {track['artist']} ({track['album']})")
        if not result["tracks"]:
            print("No library matches.")
        return

    if result["status"] == "listed":
        print("Apple Music playlists:")
        for name in result["playlists"]:
            print(f"- {name}")
        return

    print(f"Playlist: {result['playlist']}")
    print(f"Added: {len(result['added'])}")
    for item in result["added"]:
        track = item["track"]
        print(f"- {track['title']} - {track['artist']} ({track['album']})")
    if result["missing"]:
        print("Missing from library:")
        for item in result["missing"]:
            print(f"- {item['query']}")


def main() -> None:
    args = parse_args()

    if args.list_playlists:
        print_result({"status": "listed", "playlists": list_playlists()}, args.json)
        return

    if args.search:
        print_result({"status": "searched", "query": args.search, "tracks": search_library(args.search)}, args.json)
        return

    playlist = args.playlist.strip()
    if not playlist:
        raise SystemExit("--playlist is required unless --list-playlists or --search is used")

    create_playlist(playlist)

    result: dict[str, Any] = {
        "status": "updated",
        "playlist": playlist,
        "added": [],
        "missing": [],
    }
    if not args.create_only:
        for raw_song in args.song:
            request = parse_song(raw_song)
            match = best_match(request)
            if not match:
                result["missing"].append({"query": request.query})
                continue
            add_track(playlist, match["persistent_id"])
            result["added"].append({"query": request.query, "track": match})

    print_result(result, args.json)


if __name__ == "__main__":
    main()
