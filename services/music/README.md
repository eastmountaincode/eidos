# Apple Music Playlists

Agent-facing tool for creating Apple Music playlists and adding tracks that are already in Andrew's Music library.

Create an empty playlist:

```sh
python3 ~/.eidos/services/music/apple_music_playlist.py --playlist "Playlist name" --create-only
```

Add one or more library tracks:

```sh
python3 ~/.eidos/services/music/apple_music_playlist.py \
  --playlist "Playlist name" \
  --song "Song title|Artist" \
  --song "Another song|Another artist"
```

Search the local library:

```sh
python3 ~/.eidos/services/music/apple_music_playlist.py --search "Song or artist"
```

Current limitation: arbitrary Apple Music catalog search/add is not scriptable through Music AppleScript. That path needs GUI automation, which requires Accessibility permission for the process driving Music.
