import argparse
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse
import process_summary_jobs as worker

class SummaryTests(unittest.TestCase):
    def test_configured_codex_binary_precedes_old_path_install(self):
        with patch.dict(worker.os.environ, {'CODEX_BINARY': '/current/codex'}), patch.object(worker.shutil, 'which', return_value='/old/codex'):
            self.assertEqual(worker.default_codex_bin(), '/current/codex')

    def test_empty_window_does_not_summarize_older_messages(self):
        args = argparse.Namespace(chat_db='/unused', codex_model='test')
        job = {'id': 'one', 'conversation_key': 'alice', 'window_days': 7}
        with patch.object(worker, 'update_summary_job', side_effect=lambda a, i, p: p), \
             patch.object(worker, 'query_messages', return_value=[]), \
             patch.object(worker, 'query_latest_messages') as older, \
             patch.object(worker, 'run_codex') as codex:
            result = worker.process_job(args, job)
        self.assertEqual(result['status'], 'failed')
        older.assert_not_called()
        codex.assert_not_called()

    def test_cached_fallback_preserves_requested_window(self):
        args = argparse.Namespace(api_url='https://example.test', api_token='test')
        with patch.object(worker, 'request_json', return_value={'recentMessages': []}) as request:
            worker.query_cached_messages(args, {'conversation_key': 'alice', 'window_days': 7})
        params = parse_qs(urlparse(request.call_args.args[2]).query)
        self.assertIn('since', params)
        self.assertEqual(params['limit'], ['5000'])

    def test_empty_model_output_is_failed(self):
        args = argparse.Namespace(chat_db='/unused', codex_model='test')
        with patch.object(worker, 'update_summary_job', side_effect=lambda a, i, p: p), \
             patch.object(worker, 'query_messages', return_value=[{'timestamp': '2026-11-05', 'text': 'Hello'}]), \
             patch.object(worker, 'run_codex', return_value={'summary': ''}):
            result = worker.process_job(args, {'id': 'one'})
        self.assertEqual(result['status'], 'failed')

if __name__ == '__main__':
    unittest.main()
