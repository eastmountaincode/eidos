#!/usr/bin/env python3
"""Bounded daily Eidos maintenance, installed as a user LaunchAgent."""
from __future__ import annotations

import argparse
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
import subprocess
import tempfile
import urllib.request

ROOT = Path('/Users/oasis/.eidos')
STATE = ROOT / 'data/maintenance'
REPO = ROOT / 'runtime/maintenance-repo'
BINARY = ROOT / 'runtime/codex-0.171.0/node_modules/.bin/codex'
REMOTE = 'https://github.com/eastmountaincode/eidos.git'


def load_environment():
    env = dict(os.environ)
    for path in (ROOT / '.env', ROOT / 'services/telegram/.env'):
        if path.exists():
            for line in path.read_text().splitlines():
                if line.strip() and not line.lstrip().startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    env.setdefault(key.strip(), value.strip().strip('\"\''))
    env['PATH'] = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
    env.pop('OPENAI_API_KEY', None)
    env.pop('CODEX_API_KEY', None)
    return env


def idle(env):
    request = urllib.request.Request(env['EIDOS_WORKER_URL'].rstrip('/') + '/api/agent-chat?conversation=main',
        headers={'Authorization': 'Bearer ' + env['EIDOS_API_TOKEN'], 'User-Agent': 'Eidos/0.1'})
    with urllib.request.urlopen(request, timeout=20) as response:
        turns = json.load(response)['turns']
    return not any(turn['status'] in ('queued', 'running') for turn in turns)


def run(args, cwd, env, log, timeout=600):
    result = subprocess.run(args, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=timeout)
    if result.returncode:
        raise RuntimeError(f'{args[0]} {args[1]} exited {result.returncode}')


def output(args, cwd, env):
    return subprocess.check_output(args, cwd=cwd, env=env, text=True).strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Check prerequisites and queue without running an agent or changing code.')
    parser.add_argument('--force', action='store_true', help='Run even if already attempted today; still requires idle chat.')
    args = parser.parse_args()
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (STATE / 'lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('Maintenance already running'); return
        env = load_environment()
        available = idle(env)
        pending_release = STATE / 'pending-release.json'
        if args.check:
            print(json.dumps({'runtime_exists': BINARY.is_file(), 'chat_idle': available,
                'release_pending': pending_release.exists(),
                'schedule': 'Daily at 04:30 local; hourly catch-up while idle', 'source': REMOTE}))
            return
        if pending_release.exists():
            print('Deferred: coordinated Eidos release is waiting for deployment access'); return
        if not available:
            print('Deferred: web chat is active'); return
        now = dt.datetime.now().astimezone()
        today = now.date().isoformat()
        state_path = STATE / 'last-run.json'
        previous = json.loads(state_path.read_text()) if state_path.exists() else {}
        if not args.force and (now.hour < 4 or (now.hour == 4 and now.minute < 30) or previous.get('date') == today):
            return
        record = {'date': today, 'started_at': now.isoformat(), 'status': 'running'}
        state_path.write_text(json.dumps(record, indent=2))
        log_path = STATE / f'{today}-{now.strftime("%H%M%S")}.log'
        try:
            with log_path.open('w') as log:
                os.chmod(log_path, 0o600)
                if not REPO.exists():
                    run(['git', 'clone', REMOTE, str(REPO)], ROOT, env, log)
                run(['git', 'fetch', 'origin', 'main'], REPO, env, log)
                checkout = Path(tempfile.mkdtemp(prefix='eidos-maintenance-'))
                run(['git', 'worktree', 'add', '--detach', str(checkout), 'origin/main'], REPO, env, log)
                record['checkout'] = str(checkout)
                # The prompt is versioned policy, not content from a fetched page or personal data.
                prompt = (Path(__file__).parent / 'task.md').read_text()
                run([str(BINARY), 'exec', '--model', 'gpt-6.2-sol', '--dangerously-bypass-approvals-and-sandbox',
                    '--cd', str(checkout), prompt], checkout, env, log, timeout=1200)
                # The agent proposes edits; this wrapper owns commit and deployment.
                changes = output(['git', 'status', '--porcelain'], checkout, env)
                if not changes:
                    record['status'] = 'no_changes'
                else:
                    paths = output(['git', 'ls-files', '--modified', '--others', '--exclude-standard'], checkout, env).splitlines()
                    allowed = ('app/', 'shared/', 'docs/', 'services/telegram/', 'services/maintenance/', 'apps/api/src/', 'apps/api/test/')
                    if len(paths) > 20 or any(not path.startswith(allowed) for path in paths):
                        raise RuntimeError('Proposed change exceeds routine maintenance scope; retained for review')
                    run(['git', 'diff', '--check'], checkout, env, log)
                    run(['npm', 'ci', '--no-audit', '--no-fund'], checkout, env, log)
                    run(['npm', 'run', 'build'], checkout, env, log)
                    for area in ('apps/api', 'services/telegram'):
                        run(['npm', 'ci', '--no-audit', '--no-fund'], checkout / area, env, log)
                    run(['npm', 'test'], checkout / 'apps/api', env, log)
                    run(['npm', 'run', 'typecheck'], checkout / 'services/telegram', env, log)
                    run(['node', '--import', 'tsx', '--test', 'src/codex-args.test.ts', 'src/chat-attachments.test.ts',
                        '../../app/lib/chat-settings.test.ts'], checkout / 'services/telegram', env, log)
                    if not idle(env):
                        raise RuntimeError('Chat became active; verified edits retained without publishing')
                    run(['git', 'add', '--', *paths], checkout, env, log)
                    run(['git', 'commit', '-m', 'Apply verified daily Eidos maintenance'], checkout, env, log)
                    # Runtime/schema migrations need an explicit installation plan; preserve the proposal.
                    if any(p.startswith(('services/telegram/', 'services/maintenance/', 'shared/')) for p in paths):
                        raise RuntimeError('Runtime update retained for coordinated installation; no partial release')
                    if any(p.startswith(('apps/api/src/', 'shared/')) for p in paths):
                        run(['npm', 'run', 'deploy'], checkout / 'apps/api', env, log)
                        run(['/usr/bin/python3', str(Path(__file__).parent / 'verify_live.py')], checkout, env, log)
                    run(['git', 'push', 'origin', 'HEAD:main'], checkout, env, log)
                    record['commit'] = output(['git', 'rev-parse', 'HEAD'], checkout, env)
                    record['status'] = 'published'
                    run(['/usr/bin/python3', str(Path(__file__).parent / 'verify_live.py'), '--deployment', record['commit']], checkout, env, log)
                record['finished_at'] = dt.datetime.now().astimezone().isoformat()
                if record['status'] in ('published', 'no_changes'):
                    # Remove only this run's isolated, clean worktree. Failed proposals stay reviewable.
                    run(['git', 'worktree', 'remove', str(checkout)], REPO, env, log)
        except Exception as error:
            record.update(status='needs_attention', error=str(error), finished_at=dt.datetime.now().astimezone().isoformat())
        state_path.write_text(json.dumps(record, indent=2))
        subprocess.run(['/usr/bin/python3', str(ROOT / 'services/skills/update_capability.py'), '--id', 'background-maintenance',
            '--notes', json.dumps(record)], env=env, stdout=subprocess.DEVNULL, timeout=30)
        print(json.dumps(record))


if __name__ == '__main__':
    main()
