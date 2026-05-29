# SDD 0020: Agent Harness JSONL Evidence Store

## Problem

Agent Harness dry-run decisions can now produce audit evidence in memory, but evidence disappears when the process exits. Before any real local file, process, or browser adapter is allowed, the Harness needs a local durable evidence store that can be inspected and replayed.

The store must stay simple and append-only so it can support rollback review without becoming a database dependency in the Rust local runtime.

## Source Requirement References

- Root requirement: the assistant can control desktop applications through the orchestrating agent.
- SDD 0000: external application control must pass through Agent Harness.
- SDD 0018: Harness decisions become audit evidence.
- SDD 0019: `DryRunHarness` ties decisions and evidence append together without side effects.
- Roadmap P5: Agent Harness requires permission, evidence, and rollback model.

## Scope

In scope:

- Add a Rust JSONL evidence store.
- Append one audit evidence record per line.
- Create the parent directory when needed.
- Read records back in append order.
- Return typed store errors for IO and JSON decode failures.
- Keep this store local and dependency-light.

Out of scope:

- Database persistence.
- Encryption at rest.
- Evidence pruning or retention policy.
- Real desktop control.
- Human approval queue execution.

## Contracts

This slice reuses:

- `contracts/harness/audit-evidence.schema.json`
- `contracts/harness/audit-evidence.example.json`

Rust API:

- `JsonlEvidenceStore`
- `EvidenceStoreError`

## Acceptance Criteria

- Rust tests prove JSONL append creates parent directories.
- Rust tests prove two records read back in append order.
- Rust tests prove evidence is stored as one JSON object per line.
- Rust tests prove invalid JSONL returns a typed JSON error.
- Structure verification requires SDD 0020 and JSONL store tests.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove `JsonlEvidenceStore`, `EvidenceStoreError`, and their tests. The in-memory evidence store and dry-run facade remain valid.

## Observability And Performance Evidence

Record:

- quality gate result.
- append/read behavior for local JSONL evidence.
- future append latency benchmark once the Harness writes evidence during local runtime dry-run flows.

