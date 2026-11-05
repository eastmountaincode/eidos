"""Hibernating wake hints; all timers and retries run on the Mac mini."""
from __future__ import annotations

import json
import random
import threading
import time
import urllib.parse

import websocket


class WakeChannel:
    def __init__(self, api_url: str, token: str):
        url = urllib.parse.urlsplit(api_url)
        self.url = urllib.parse.urlunsplit((
            "wss" if url.scheme == "https" else "ws", url.netloc,
            "/api/messages/jobs/connect", "", ""))
        self.token = token
        self.revision = 0
        self.condition = threading.Condition()
        self.stopped = threading.Event()
        self.socket = None
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def _notify(self):
        with self.condition:
            self.revision += 1
            self.condition.notify_all()

    def _run(self):
        retry = 1
        while not self.stopped.is_set():
            opened = False
            try:
                self.socket = websocket.create_connection(
                    self.url, header={"Authorization": f"Bearer {self.token}"},
                    timeout=15, suppress_origin=True, redirect_limit=0)
                opened = True
                self.socket.settimeout(1)
                print('{"event":"message_wake_connected","transport":"hibernating-websocket"}', flush=True)
                self._notify()
                last_ping = 0.0
                last_pong = time.monotonic()
                while not self.stopped.is_set():
                    now = time.monotonic()
                    if now - last_pong > 75:
                        break
                    if now - last_ping >= 25:
                        self.socket.send("ping")
                        last_ping = now
                    try:
                        message = self.socket.recv()
                    except websocket.WebSocketTimeoutException:
                        continue
                    if not message:
                        break
                    if message == "pong":
                        last_pong = time.monotonic()
                        continue
                    try:
                        if json.loads(message).get("woken") is True:
                            self._notify()
                    except (ValueError, AttributeError):
                        pass
            except Exception:
                pass  # Do not log headers/tokens from transport exceptions.
            finally:
                if self.socket:
                    self.socket.close()
            self._notify()
            if opened:
                retry = 1
            if not self.stopped.is_set():
                print('{"event":"message_wake_reconnecting"}', flush=True)
            self.stopped.wait(retry + random.random())
            retry = min(retry * 2, 60)

    def wait_since(self, revision: int, timeout: int = 300):
        with self.condition:
            self.condition.wait_for(
                lambda: self.revision != revision or self.stopped.is_set(), timeout=timeout)

    def close(self):
        self.stopped.set()
        if self.socket:
            self.socket.close()
        self._notify()
