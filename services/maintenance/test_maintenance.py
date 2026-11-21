import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import run_maintenance as maintenance


class MaintenanceTests(unittest.TestCase):
    def test_busy_chat_defers_without_invoking_agent(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(maintenance, 'STATE', Path(directory)), \
                patch.object(maintenance, 'load_environment', return_value={}), \
                patch.object(maintenance, 'idle', return_value=False), patch.object(maintenance, 'run') as run, \
                patch('sys.argv', ['maintenance', '--force']), contextlib.redirect_stdout(io.StringIO()) as result:
            maintenance.main()
            self.assertIn('Deferred', result.getvalue())
            run.assert_not_called()
            self.assertFalse((Path(directory) / 'last-run.json').exists())

    def test_check_is_read_only_even_when_busy(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(maintenance, 'STATE', Path(directory)), \
                patch.object(maintenance, 'load_environment', return_value={}), \
                patch.object(maintenance, 'idle', return_value=False), patch.object(maintenance, 'run') as run, \
                patch('sys.argv', ['maintenance', '--check']), contextlib.redirect_stdout(io.StringIO()) as result:
            maintenance.main()
            self.assertFalse(json.loads(result.getvalue())['chat_idle'])
            run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
