#!/usr/bin/env python3
"""Verify public deployment plus authenticated collection endpoints, without changing user data."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import time
import urllib.request

from run_maintenance import load_environment


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--deployment')
    args = parser.parse_args()
    env = load_environment()
    if args.deployment:
        deadline = time.monotonic() + 300
        while time.monotonic() < deadline:
            result = subprocess.check_output(['gh', 'api', f'repos/eastmountaincode/eidos/commits/{args.deployment}/status'], env=env, text=True)
            statuses = json.loads(result)['statuses']
            vercel = next((item for item in statuses if item['context'] == 'Vercel'), None)
            if vercel and vercel['state'] == 'success':
                break
            if vercel and vercel['state'] in ('failure', 'error'):
                raise RuntimeError('Vercel Git deployment failed')
            time.sleep(5)
        else:
            raise RuntimeError('Timed out waiting for Vercel Git deployment')
        # Verify that the canonical domain serves this build, not only a deployment URL.
        chunks = Path('.next/static/chunks')
        composer = next((path for path in chunks.glob('*.js') if b'eidos-v2-textarea' in path.read_bytes()), None)
        if composer is None:
            raise RuntimeError('Could not identify composer bundle in built output')
        url = 'https://eidos.andrew-boylan.com/_next/static/chunks/' + composer.name
        with urllib.request.urlopen(url, timeout=30) as response:
            remote = response.read()
        if hashlib.sha256(remote).digest() != hashlib.sha256(composer.read_bytes()).digest():
            raise RuntimeError('Canonical domain does not yet serve the tested build')
    for path in ('/api/sources', '/api/future-events'):
        request = urllib.request.Request(env['EIDOS_WORKER_URL'].rstrip('/') + path,
            headers={'Authorization': 'Bearer ' + env['EIDOS_API_TOKEN'], 'User-Agent': 'Eidos/0.1'})
        with urllib.request.urlopen(request, timeout=30) as response:
            json.load(response)
            assert response.status == 200
    # Check unchanged-snapshot writes in an isolated D1 fixture, never replay private
    # Messages into production where it could race a new automatic export.
    subprocess.run(['node', '--test', 'test/ingest.test.js'], cwd='apps/api', env=env, check=True, timeout=60)
    print('Verified: live Sources/Future; isolated unchanged-ingest regression' + ('; canonical deployment bundle' if args.deployment else ''))


if __name__ == '__main__':
    main()
