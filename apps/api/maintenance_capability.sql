INSERT INTO agent_capabilities (id, kind, name, status, category, summary, invocation, notes, sort_order)
VALUES ('background-maintenance', 'skill', 'Background maintenance', 'active', 'Eidos',
  'Daily bounded maintenance checks and verified routine improvements, with idle deferral and recorded results.',
  'launchd ai.eidos.maintenance -> /usr/bin/python3 /Users/oasis/.eidos/services/maintenance/run_maintenance.py',
  'Requires the Mac mini online and working GitHub, Cloudflare and ChatGPT credentials. Schedule: 04:30 local, hourly catch-up. Runtime/schema changes require coordinated installation.', 95)
ON CONFLICT(id) DO NOTHING;
