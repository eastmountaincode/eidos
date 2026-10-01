# Skills Service

Purpose: maintain a visible, testable inventory of Eidos capabilities.

The shared D1 catalog is authoritative. Read it with:

```sh
python3 ~/.eidos/services/skills/knowledge_context.py
```

Each skill should have:

- name
- summary
- examples
- input/output shape
- last tested timestamp
- status: ready, needs_test, broken, planned

After changing a tool or skill implementation, prompt instructions, private config, or tested status, update its D1 registry row so the portal `Updated` timestamp remains meaningful:

```sh
python3 ~/.eidos/services/skills/update_capability.py --id "invoice-generator"
```

Pass `--notes`, `--summary`, `--status`, or other metadata fields when the visible registry text should change too.

Chat, `/skills`, and About Eidos use this catalog instead of separate static
inventories. A declared status is not a live health check. Procedure metadata and
dated verification evidence are separate records; do not fabricate a new test
date from old notes.

See [knowledge and feedback](../../docs/agent-knowledge.md) for feedback capture,
source references, revision history, capability checks, and deployment.
