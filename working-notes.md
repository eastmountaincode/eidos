# Personal Agent Working Notes

## Name

- New agent/system name: Eidos.
- Use Eidos for the new build, not as a continuation of Clawd/OpenClaw identity.

## Profile Switching

- Want: `/profile personal|creative|bioinformatics` to choose the active context.
- Want: profiles have separate memory/context windows, with a small shared identity layer.
- Want: profiles know what the others are for, but do not load each other's full memory by default.
- Don't want: auto-routing or cross-profile assumptions until we explicitly design that.
- Don't want: profile-specific tool restrictions; every profile can use the full toolset.

## Memory And Recall

- Want: the agent can decide when session recall is relevant without asking first.
- Want: `/remember` and `/forget` for explicit memory edits when Andrew wants control.
- Want: personal memory can be richer/life-history oriented; creative and bioinformatics memory should be more concise.
- Don't want: `CURRENT.md` / active-priority tracking that goes stale or invents obligations.
- Don't want: old Claude-style task logs as the center of memory.

## Proactivity

- Want: morning/evening check-ins may be useful if grounded in calendar, texts, email, and real current inputs.
- Don't want: generic heartbeats, old-note churn, or check-ins based on stale agent assumptions.

## Portal

- Want: web portal remains a central interface in the next version.
- Need: inspect current `.clawd` portal and identify what to keep, simplify, or replace.
- Current portal has useful Messages, People, Memory, Tasks, Events, Research, State tabs, but too much old Clawd/Claude/research/task framing.
- Keep: Messages analytics, People view, Memory timeline shape, skill/status visibility idea.
- Change: make portal profile-aware, less agent-self-focused, less task/research dominated, and grounded in real current data.

## Skills

- Want: visible skill inventory in portal and compact `/skills` command.
- Want: skills are inspectable/testable so Andrew can verify they exist and still work.
- Examples: meeting/audio transcription from a file; image-to-Apple-Music-playlist.
- Don't want: verbose skill lists if the system has many skills.

## Messages / Texts

- Want: periodically ingest iMessage/SMS from the Mac mini and make them available for recall, questions, prompts, and analytics.
- Want: support "did you see those messages?" style conversations without manually pasting context.
- Want: analytics like reply balance, timing, conversation volume, and person-specific patterns.
- Want: message context to inform personal memory/check-ins, but not become noisy task logs.
- Need: contact resolution even though it will be imperfect; corrections should happen conversationally with the agent, not through manual contact commands.
- Need: persist aliases/merges for people, handles, numbers, emails, and group chats after conversational correction.
- Need: handle privacy, access permissions, sync freshness, and read-only ingestion carefully.

## Daily History

- Want: life-history notes grounded in meaningful events, text conversations, agent conversations, and things Andrew processed or got curious about.
- Want: message + agent conversation overlap to be especially eligible for history.
- Don't want: calendar events copied into history just because they exist.
- Don't want: generic research logs unless Andrew actively discussed or cared about the research.

## Email And Calendar

- Want: Apple Calendar/iCal integration for schedule-aware check-ins.
- Defer: email integration; expect filtering/noise problems because much email is junk.
- Don't want: calendar/email to dominate history without meaningful context.

## Check-ins

- Want: morning and evening check-ins at consistent times.
- Morning: today's schedule, maybe tomorrow, plus relevant message context.
- Evening: tomorrow's schedule plus summaries/thoughts about meaningful conversations from the day.
- Don't want: generic heartbeat/check-in content based on stale assumptions.

## People Model

- Want: track people in Andrew's life, relationships, recent conversations, and how relationships change over time.
- Need: figure out the right framework; avoid over-designing before message/contact data exists.
