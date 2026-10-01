# Eidos knowledge and feedback

The shared D1 capability catalog is the authority for the web chat prompt,
Telegram's `/skills` response and the rebuild's `/about` inspector. There is no
second hard-coded inventory in the agent. Catalog fetches happen alongside
personal-memory reads on every agent turn. If the catalog cannot be loaded,
the prompt explicitly marks it unavailable rather than inventing capability
status or claiming feedback was saved.

## Separate kinds of knowledge

- `agent_capabilities`: existing names, declared statuses, invocations and notes.
- `agent_capability_details`: procedures, requirements and limitations. A
  procedure can reference a versioned local README or SKILL.md. Merely adding a
  file does not register an ability; its catalog entry must point to it.
- `agent_capability_checks`: dated, append-only pass/fail evidence. Declared
  `active` does not mean installed, authorized or tested today. Unchecked
  abilities explicitly have no recorded check. The web-agent heartbeat only
  proves the adapter recently connected, not that every ability works.
- `agent_feedback`: scoped preferences, decisions and defects, with the user's
  original words and conversation reference. Resolved and withdrawn records are
  excluded from future prompt injection. Existing chat history may still contain
  earlier records; the prompt instructs Eidos to use the current registry.
- `agent_feedback_revisions`: automatic snapshots of every create/edit, including
  withdrawal and resolution. Edits require the current revision. Retry delivery
  of the same ID and content is idempotent and does not append more revisions.
- `source_entries`: existing reference collection. The inspector shows entries
  tagged `design`; tags can overlap subjects without duplicating references.
  Titles, descriptions and downloaded source content are reference material,
  not permission to act or instructions overriding the user.
- Personal memory and dated life history remain in their existing tables.

Feedback is learned through explicit tool writes, not implicit model training.
The agent must read existing records, preserve provenance, distinguish issues
from preferences, and confirm a successful write before saying it remembered
something. Issue resolution requires a verification note. Feedback does not
authorize deployments, permission changes or unrelated external actions.

## Agent tools

`python3 ~/.eidos/services/skills/knowledge_context.py` reads the catalog.
`--feedback --search "design"` finds scoped feedback. `--id ID` reads a record
and its revision history. Use `--save --id STABLE_ID --kind preference --title
"TITLE" --body "DETAILS" --scope eidos.design --source-ref "eidos-chat:TURN_ID"
--source-quote "USER WORDS"` to create a record. Keep the ID when retrying.
To edit, read first and add `--revision N`; `--status withdrawn` retires a rule.
Resolve a defect with `--status resolved --resolution "TEST AND OUTCOME"`.

`--capability ID --instructions "PROCEDURE" --requirements "DEPENDENCIES"
--limitations "LIMITS"` updates procedure metadata. To record a real check use
`--capability ID --check-id STABLE_ID --result passed|failed --evidence "TEST AND
OUTCOME"`. Do not manufacture a new test date from old registry notes.
Existing `update_capability.py` still edits the base catalog metadata.

The inspector offers the same feedback creation, editing, retirement and
history. Data APIs require Worker authentication; portal writes additionally
require the authenticated session and matching origin. They are not public.

## Deployment and verification

1. Run root `npm run build`, API `npm test` and Telegram `npm run typecheck`.
2. Commit a clean revision. From `apps/api`, apply **only** the additive
   `agent_knowledge.sql` migration to the existing database. Do not rerun the
   whole bootstrap schema against production.
3. Deploy that committed Worker. Check Sources, Future and an unchanged Messages
   snapshot (zero conversation/message delta), as required by AGENTS.md.
4. With existing Worker credentials, run `node services/skills/bootstrap-knowledge.mjs
   --apply`. It adds nine existing tool procedures where metadata is missing,
   the two approved design sources and five feedback records,
   never overwriting existing matching records. Without `--apply` it only reports
   the intended additions.
5. Compare installed Mac mini files before updating. Back up changed files and
   preserve private configuration, memories, sessions and unrelated remote edits.
   Install the new knowledge module and Python tool with the changed context,
   runner and adapters. Restart the web adapter only when there is no active turn.
   An already-running Telegram process needs a separate safe restart to consume
   its updated `/skills` handler; file installation alone does not update it.
6. Push the rebuild branch. Vercel deploys through GitHub; do not promote the
   preview or switch the original production portal.
7. Verify live inspector rendering, sources, feedback revisions and a real chat
   response using the catalog. Verify a feedback write and retrieval separately;
   reading a prompt fixture is not proof of a real agent saving feedback.

No new heartbeat writes are added to D1. Reading the inspector or rebuilding an
agent prompt does not rewrite catalog or feedback rows. New writes occur for
explicit records, revisions, checks, or existing chat/ingest operations.
