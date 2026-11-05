#!/usr/bin/env python3
"""Read the shared Eidos catalog; save explicit feedback with provenance."""
from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from update_capability import load_env_file


def main():
    root = Path(os.environ.get('EIDOS_HOME', str(Path.home() / '.eidos')))
    load_env_file(root / '.env')
    load_env_file(root / 'services/telegram/.env')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--feedback', action='store_true', help='List feedback instead of the catalog.')
    parser.add_argument('--search', default='')
    parser.add_argument('--offset', type=int, default=0)
    parser.add_argument('--all', action='store_true', help='Include resolved and withdrawn feedback.')
    parser.add_argument('--id', help='Read a feedback record and its revisions, or supply a stable ID for a write.')
    parser.add_argument('--save', action='store_true')
    parser.add_argument('--revision', type=int, help='Required when editing an existing record; read it first.')
    parser.add_argument('--kind', choices=['preference', 'decision', 'issue'])
    for name in ['title', 'body', 'scope', 'source-ref', 'source-quote', 'status', 'resolution']:
        parser.add_argument('--' + name)
    parser.add_argument('--capability', help='Capability ID for recording an actual verification result.')
    parser.add_argument('--check-id', help='Stable ID for this verification; reuse when retrying delivery.')
    parser.add_argument('--result', choices=['passed', 'failed'])
    parser.add_argument('--evidence')
    for name in ['instructions', 'requirements', 'limitations']:
        parser.add_argument('--' + name, help='Update capability procedure metadata, not a verification result.')
    args = parser.parse_args()
    base = os.environ.get('EIDOS_WORKER_URL', '')
    token = os.environ.get('EIDOS_API_TOKEN', '')
    if not base or not token:
        parser.error('Eidos Worker configuration is missing.')
    method, payload = 'GET', None
    path = '/api/agent-knowledge'
    if args.capability:
        details = {k: getattr(args, k) for k in ['instructions', 'requirements', 'limitations'] if getattr(args, k) is not None}
        if details:
            if any([args.check_id, args.result, args.evidence]):
                parser.error('Update procedure metadata and verification results in separate calls.')
            path = '/api/capabilities/' + urllib.parse.quote(args.capability, safe='') + '/details'
            method, payload = 'POST', details
        else:
            if not all([args.check_id, args.result, args.evidence]):
                parser.error('--capability requires procedure details or --check-id, --result and --evidence.')
            path = '/api/capabilities/' + urllib.parse.quote(args.capability, safe='') + '/checks'
            method, payload = 'POST', {'id': args.check_id, 'result': args.result, 'evidence': args.evidence}
    elif args.save:
        if not args.id:
            parser.error('--save requires a stable --id (reuse it for retries).')
        payload = {k: getattr(args, k) for k in ['kind', 'title', 'body', 'scope', 'source_ref', 'source_quote', 'status', 'resolution'] if getattr(args, k) is not None}
        payload['id'] = args.id
        path, method = '/api/feedback', 'POST'
        if args.revision is not None:
            path += '/' + urllib.parse.quote(args.id, safe='')
            method, payload['revision'] = 'PATCH', args.revision
    elif args.id:
        path = '/api/feedback/' + urllib.parse.quote(args.id, safe='')
    elif args.feedback or args.search or args.all or args.offset:
        path = '/api/feedback?' + urllib.parse.urlencode({'q': args.search, 'status': 'all' if args.all else 'current', 'offset': args.offset})
    request = urllib.request.Request(base.rstrip('/') + path, method=method,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'User-Agent': 'Eidos/0.1'})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            print(json.dumps(json.load(response), ensure_ascii=False, indent=2))
    except urllib.error.HTTPError as error:
        try:
            message = json.load(error).get('error', 'Request rejected')
        except (ValueError, AttributeError):
            message = 'Request rejected'
        raise SystemExit(f'Eidos returned {error.code}: {message}')


if __name__ == '__main__':
    main()
