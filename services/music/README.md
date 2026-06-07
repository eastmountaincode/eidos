# Apple Music Catalog Playlists

Agent-facing tool for creating Apple Music playlists and adding Apple Music catalog tracks through MusicKit.

This uses a dedicated signed-in Chrome profile:

```text
~/.eidos/browser-profiles/apple-music-chrome
```

Chrome is controlled through the DevTools Protocol on localhost port `9223`. If the tool says authorization is needed, sign into Apple Music in that dedicated Chrome window.

Create an empty playlist:

```sh
python3 ~/.eidos/services/music/apple_music_playlist.py --playlist "Playlist name" --create-only
```

Add one or more catalog tracks:

```sh
python3 ~/.eidos/services/music/apple_music_playlist.py \
  --playlist "Playlist name" \
  --song "Song title|Artist" \
  --song "Another song|Another artist"
```

Search the local library:
Search Apple Music catalog:

```sh
python3 ~/.eidos/services/music/apple_music_playlist.py --search "Song or artist"
```

Current limitation: image understanding is not part of this tool yet. The agent should extract song titles/artists from text or an image first, then call this tool with `--song "Title|Artist"` for each track.
