import threading
import time
import unittest
from unittest.mock import patch

from wake_channel import WakeChannel


class WakeTests(unittest.TestCase):
    def test_buffered_wake_fallback_shutdown_and_reconnection(self):
        # A transport outage must not stop fallback queue checks or shutdown.
        with patch("wake_channel.websocket.create_connection", side_effect=OSError("offline")) as connect:
            wake = WakeChannel("https://example.test", "fixture-token")
            try:
                before = wake.revision
                wake._notify()  # Notification between queue read and wait.
                start = time.monotonic()
                wake.wait_since(before, timeout=2)
                self.assertLess(time.monotonic() - start, .1)
                before = wake.revision
                start = time.monotonic()
                wake.wait_since(before, timeout=.03)
                self.assertLess(time.monotonic() - start, .5)
                waiting = threading.Thread(target=lambda: wake.wait_since(wake.revision, 10))
                waiting.start()
                deadline = time.monotonic() + 3
                while connect.call_count < 2 and time.monotonic() < deadline:
                    time.sleep(.05)
                self.assertGreaterEqual(connect.call_count, 2)
                wake.close()
                waiting.join(1)
                wake.thread.join(1)
                self.assertFalse(waiting.is_alive())
                self.assertFalse(wake.thread.is_alive())
                self.assertEqual(connect.call_args.kwargs["redirect_limit"], 0)
            finally:
                wake.close()


if __name__ == "__main__":
    unittest.main()
