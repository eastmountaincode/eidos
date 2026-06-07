#!/usr/bin/env python3
"""Create Apple Music playlists and add catalog tracks through MusicKit."""

from __future__ import annotations

import argparse
import json
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

try:
    import websocket
except ImportError as exc:  # pragma: no cover - dependency is installed on the Mac mini.
    raise SystemExit("Python package websocket-client is required for Chrome DevTools control.") from exc


DEBUG_PORT = 9223
BROWSER_PROFILE = Path.home() / ".eidos/browser-profiles/apple-music-chrome"
MUSIC_URL = "https://music.apple.com/us/new"
CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SCRIPT_TIMEOUT_SECONDS = 90


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
    parser.add_argument("--description", default="", help="Playlist description for newly created playlists.")
    parser.add_argument("--create-only", action="store_true", help="Create the playlist without adding songs.")
    parser.add_argument("--list-playlists", action="store_true", help="List Apple Music library playlists.")
    parser.add_argument("--search", default="", help="Search the Apple Music catalog without modifying playlists.")
    parser.add_argument("--port", type=int, default=DEBUG_PORT, help="Chrome DevTools port for the dedicated Eidos Apple Music profile.")
    parser.add_argument("--json", action="store_true", help="Print raw JSON.")
    return parser.parse_args()


def ensure_chrome(port: int) -> None:
    if can_reach_debugger(port):
        return

    BROWSER_PROFILE.mkdir(parents=True, exist_ok=True)
    subprocess.Popen(
        [
            CHROME_PATH,
            f"--remote-debugging-port={port}",
            "--remote-allow-origins=*",
            f"--user-data-dir={BROWSER_PROFILE}",
            MUSIC_URL,
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    deadline = time.time() + 15
    while time.time() < deadline:
        if can_reach_debugger(port):
            return
        time.sleep(0.5)
    raise SystemExit("Could not start the dedicated Eidos Apple Music Chrome profile.")


def can_reach_debugger(port: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/version", timeout=1):
            return True
    except Exception:
        return False


def request_json(url: str, *, method: str = "GET") -> Any:
    request = urllib.request.Request(url, method=method)
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def music_page(port: int) -> dict[str, Any]:
    pages = request_json(f"http://127.0.0.1:{port}/json/list")
    for page in pages:
        if page.get("type") == "page" and "music.apple.com" in str(page.get("url", "")):
            return page

    encoded_url = urllib.parse.quote(MUSIC_URL, safe="")
    try:
        request_json(f"http://127.0.0.1:{port}/json/new?{encoded_url}", method="PUT")
    except urllib.error.HTTPError:
        request_json(f"http://127.0.0.1:{port}/json/new?{MUSIC_URL}", method="PUT")
    time.sleep(3)
    pages = request_json(f"http://127.0.0.1:{port}/json/list")
    for page in pages:
        if page.get("type") == "page" and "music.apple.com" in str(page.get("url", "")):
            return page
    raise SystemExit("Could not open music.apple.com in the dedicated Eidos Chrome profile.")


def evaluate_music_js(port: int, expression: str) -> Any:
    page = music_page(port)
    ws = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=SCRIPT_TIMEOUT_SECONDS, suppress_origin=True)
    try:
        message_id = 1
        ws.send(json.dumps({
            "id": message_id,
            "method": "Runtime.evaluate",
            "params": {
                "expression": expression,
                "awaitPromise": True,
                "returnByValue": True,
            },
        }))
        deadline = time.time() + SCRIPT_TIMEOUT_SECONDS
        while time.time() < deadline:
            message = json.loads(ws.recv())
            if message.get("id") != message_id:
                continue
            details = message.get("exceptionDetails") or message.get("result", {}).get("exceptionDetails")
            if details:
                raise SystemExit(details.get("text") or json.dumps(details))
            result = message.get("result", {}).get("result", {})
            if "value" in result:
                return result["value"]
            return result
    finally:
        ws.close()
    raise SystemExit("Timed out waiting for Apple Music browser automation.")


def parse_song(raw: str) -> SongRequest:
    parts = [part.strip() for part in raw.split("|", 1)]
    if len(parts) == 1:
        return SongRequest(title=parts[0], artist="")
    return SongRequest(title=parts[0], artist=parts[1])


def js_literal(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def list_playlists(port: int) -> dict[str, Any]:
    return evaluate_music_js(port, MUSIC_KIT_SCRIPT.replace("__INPUT__", js_literal({"mode": "list"})))


def search_catalog(port: int, query: str) -> dict[str, Any]:
    return evaluate_music_js(port, MUSIC_KIT_SCRIPT.replace("__INPUT__", js_literal({"mode": "search", "query": query})))


def update_playlist(port: int, playlist: str, description: str, songs: list[SongRequest], create_only: bool) -> dict[str, Any]:
    payload = {
        "mode": "update",
        "playlist": playlist,
        "description": description,
        "createOnly": create_only,
        "songs": [{"title": song.title, "artist": song.artist, "query": song.query} for song in songs],
    }
    return evaluate_music_js(port, MUSIC_KIT_SCRIPT.replace("__INPUT__", js_literal(payload)))


def print_result(result: dict[str, Any], raw_json: bool) -> None:
    if raw_json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return

    status = result.get("status")
    if status == "needs_auth":
        print("Apple Music authorization is needed in the dedicated Eidos Chrome profile.")
        print("Open or sign into the Chrome window using ~/.eidos/browser-profiles/apple-music-chrome.")
        return

    if status == "listed":
        print("Apple Music playlists:")
        for playlist in result.get("playlists", []):
            print(f"- {playlist.get('name')}")
        return

    if status == "searched":
        print(f"Apple Music catalog search: {result.get('query')}")
        for track in result.get("tracks", []):
            print(f"- {track.get('name')} - {track.get('artist')} ({track.get('album')}) [{track.get('id')}]")
        if not result.get("tracks"):
            print("No catalog matches.")
        return

    print(f"Playlist: {result.get('playlist', {}).get('name') or result.get('playlistName')}")
    print(f"Created: {'yes' if result.get('created') else 'no'}")
    print(f"Added: {len(result.get('added', []))}")
    for item in result.get("added", []):
        track = item.get("track", {})
        print(f"- {track.get('name')} - {track.get('artist')} ({track.get('album')})")
    if result.get("missing"):
        print("Missing:")
        for item in result["missing"]:
            print(f"- {item.get('query')}: {item.get('reason')}")


def main() -> None:
    args = parse_args()
    ensure_chrome(args.port)

    if args.list_playlists:
        print_result(list_playlists(args.port), args.json)
        return

    if args.search:
        print_result(search_catalog(args.port, args.search), args.json)
        return

    playlist = args.playlist.strip()
    if not playlist:
        raise SystemExit("--playlist is required unless --list-playlists or --search is used")

    songs = [parse_song(raw) for raw in args.song]
    result = update_playlist(args.port, playlist, args.description, songs, args.create_only)
    print_result(result, args.json)


MUSIC_KIT_SCRIPT = r"""
(async () => {
  const input = __INPUT__;

  function compact(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function normalized(value) {
    return compact(value).toLowerCase();
  }

  function trackSummary(track) {
    return {
      id: track.id,
      type: track.type,
      name: track.attributes?.name || '',
      artist: track.attributes?.artistName || '',
      album: track.attributes?.albumName || '',
      url: track.attributes?.url || '',
    };
  }

  function scoreTrack(request, track) {
    const title = normalized(track.attributes?.name);
    const artist = normalized(track.attributes?.artistName);
    const requestedTitle = normalized(request.title);
    const requestedArtist = normalized(request.artist);
    let score = 0;
    if (requestedTitle && title === requestedTitle) score += 100;
    else if (requestedTitle && title.includes(requestedTitle)) score += 70;
    else if (requestedTitle && requestedTitle.split(' ').filter(Boolean).every(part => title.includes(part))) score += 45;
    if (requestedArtist && artist === requestedArtist) score += 80;
    else if (requestedArtist && artist.includes(requestedArtist)) score += 50;
    else if (requestedArtist && requestedArtist.split(' ').filter(Boolean).every(part => artist.includes(part))) score += 30;
    return score;
  }

  const mk = MusicKit.getInstance();
  if (!mk?.isAuthorized) {
    return { status: 'needs_auth' };
  }
  const storefront = mk.storefrontId || 'us';

  async function music(path, params = {}, options = {}) {
    const response = await mk.api.music(path, params, options);
    if (response.status >= 400 || response.errors) {
      throw new Error(JSON.stringify({
        path,
        status: response.status,
        statusText: response.statusText,
        errors: response.errors || response.data?.errors || null,
      }));
    }
    return response.data;
  }

  async function catalogSearch(request, limit = 5) {
    const query = compact(request.query || [request.title, request.artist].filter(Boolean).join(' '));
    if (!query) return { query, candidates: [], best: null };
    const data = await music(`/v1/catalog/${storefront}/search`, {
      term: query,
      types: 'songs',
      limit,
    });
    const candidates = data.results?.songs?.data || [];
    const scored = candidates
      .map(track => ({ track, score: scoreTrack(request, track) }))
      .sort((a, b) => b.score - a.score);
    const best = scored[0]?.track || candidates[0] || null;
    return { query, candidates: candidates.map(trackSummary), best: best ? trackSummary(best) : null };
  }

  async function allPlaylists() {
    let offset = 0;
    const playlists = [];
    while (offset < 1000) {
      const data = await music('/v1/me/library/playlists', { limit: 100, offset });
      playlists.push(...(data.data || []));
      if (!data.next || (data.data || []).length === 0) break;
      offset += 100;
    }
    return playlists;
  }

  async function findPlaylist(name) {
    const target = normalized(name);
    const playlists = await allPlaylists();
    return playlists.find(playlist => normalized(playlist.attributes?.name) === target) || null;
  }

  async function createPlaylist(name, description, tracks) {
    const body = {
      attributes: {
        name,
        description: description || '',
      },
    };
    if (tracks.length) {
      body.relationships = {
        tracks: {
          data: tracks.map(track => ({ id: track.id, type: 'songs' })),
        },
      };
    }
    const data = await music('/v1/me/library/playlists', {}, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return data.data?.[0] || null;
  }

  async function addTracks(playlistId, tracks) {
    if (!tracks.length) return;
    try {
      await music(`/v1/me/library/playlists/${playlistId}/tracks`, {}, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: tracks.map(track => ({ id: track.id, type: 'songs' })),
        }),
      });
    } catch (error) {
      // MusicKit tries to parse the successful empty 204 response body and throws.
      if (!String(error).includes('Unexpected end of JSON input')) throw error;
    }
  }

  if (input.mode === 'list') {
    const playlists = await allPlaylists();
    return {
      status: 'listed',
      playlists: playlists.map(playlist => ({
        id: playlist.id,
        name: playlist.attributes?.name || '',
        canEdit: playlist.attributes?.canEdit ?? null,
      })),
    };
  }

  if (input.mode === 'search') {
    const result = await catalogSearch({ query: input.query || '' }, 10);
    return { status: 'searched', query: result.query, tracks: result.candidates };
  }

  const requestedSongs = input.createOnly ? [] : (input.songs || []);
  const searches = [];
  const addableTracks = [];
  const missing = [];
  for (const request of requestedSongs) {
    const result = await catalogSearch(request, 5);
    searches.push(result);
    if (result.best) addableTracks.push(result.best);
    else missing.push({ query: result.query, reason: 'No Apple Music catalog match.' });
  }

  let playlist = await findPlaylist(input.playlist);
  const created = !playlist;
  if (!playlist) {
    playlist = await createPlaylist(input.playlist, input.description || '', addableTracks);
  } else {
    await addTracks(playlist.id, addableTracks);
  }

  return {
    status: 'updated',
    playlistName: input.playlist,
    playlist: playlist ? {
      id: playlist.id,
      name: playlist.attributes?.name || input.playlist,
      canEdit: playlist.attributes?.canEdit ?? null,
    } : null,
    created,
    added: addableTracks.map(track => ({
      query: searches.find(search => search.best?.id === track.id)?.query || '',
      track,
    })),
    missing,
  };
})()
"""


if __name__ == "__main__":
    main()
