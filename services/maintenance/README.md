# Daily Eidos maintenance

The user LaunchAgent `ai.eidos.maintenance` runs at 04:30 local time, with an
hourly catch-up opportunity if chat was busy. It makes at most one attempt per
day, uses a nonblocking process lock, and defers whenever web chat has queued or
running messages. The model work is bounded to 20 minutes; each build/deploy
command has its own timeout. It uses the existing ChatGPT login, not a new paid API.

`run_maintenance.py --check` verifies runtime and queue access without invoking an
agent or publishing. `--force` permits an explicit additional daily attempt but
still requires idle chat. Inspect `data/maintenance/last-run.json` and the dated
private log for the latest result; Settings exposes the capability notes.

The agent works in an isolated checkout of origin/main using `task.md`, proposes
at most one small useful fix, and cannot commit/publish as part of its task. The
wrapper checks the proposed paths, builds the portal, runs Worker tests and runner
type/tests, checks chat is still idle, then commits and publishes. Worker changes
deploy from the clean commit; Git pushes deploy the portal. Live collection checks
and a canonical-domain bundle comparison verify the release. The unchanged ingest
test uses an isolated fixture to avoid altering private Messages during a live sync.

Runtime installation, shared model/attachment contracts, schema changes, major upgrades and broad redesigns are
retained for coordinated work rather than partially deployed. Routine website and
Worker improvements can publish automatically. No change is a valid daily outcome.
Failures retain the checkout and log, update the capability record, and do not
retry indefinitely. Model availability is checked with actual replies before use.

Install the committed directory at `/Users/oasis/.eidos/services/maintenance` and
the plist in `~/Library/LaunchAgents`, then bootstrap with launchctl. The schedule
requires the Mac mini online and the existing GitHub/Cloudflare/ChatGPT credentials.
`data/maintenance/pending-release.json` defers unattended work during a coordinated
release. Remove that marker only after backend, runner and frontend are installed
and verified together. The read-only check reports this state explicitly.
