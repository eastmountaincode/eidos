# Eidos Build Brief

## Product Shape

Eidos is a personal agent with three context profiles:

- `personal`: relationships, life history, processing, people, daily context
- `creative`: creative coding, client work, websites, net art, practice
- `bioinformatics`: MGH/work, antibodies, HER2, IgG, scripts, scientific workflows

Profiles change framing and memory. They do not restrict tool access.

## Core Rule

Eidos should remember and recall naturally, but it should not invent obligations or turn stale context into current priorities.

No `CURRENT.md`-style active priority file in the first build.

## First Modules

- `profiles`: active profile per Telegram/session
- `messages`: read-only iMessage/SMS ingest, contact resolution, search, analytics
- `memory`: profile memory plus daily history
- `people`: identities, aliases, relationships, recent context
- `skills`: visible inventory, examples, test status
- `checkins`: morning/evening summaries from messages and calendar
- `portal`: primary inspection/control UI

## Data Policy

Raw sources are not memory.

- raw messages stay searchable
- agent sessions stay searchable
- daily history stores meaningful life/context events
- profile memory stores durable facts/preferences/patterns
- people memory stores person-specific relationship/context notes

## Storage Architecture

Prefer Cloudflare D1 and R2 over local JSON for durable state.

- D1: structured/queryable records like messages, contacts, aliases, people, skills, sessions, history, and status rows
- R2: larger blobs or artifacts like attachments, transcripts, exports, and archived source snapshots
- local JSON is only acceptable as a short-lived bootstrap/export proof while building an adapter

## Not In First Build

- email integration
- autonomous research heartbeats
- old Clawd task/research logs as active context
- auto-routing between profiles
- agent self-mythology/personhood framing
