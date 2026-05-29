# SDD 0022: Agent Harness Persistent Dry-Run Evidence

## Problem

Agent Harness can evaluate permissions, produce dry-run reports, and persist audit evidence through a JSONL store. The current dry-run facade only works with an infallible in-memory store, so it cannot expose local persistence failures.

Before any real desktop control can be allowed, the Harness must prove that a dry-run decision can be written to durable evidence first. If durable evidence append fails, the result must keep the decision visible but must not claim the action is execution-ready.

## Source Requirement References

- Root requirement: the coordinating assistant can control desktop applications and accept remote social commands.
- SDD 0000: external application control must pass through Agent Harness.
- SDD 0018: Harness decisions become audit evidence.
- SDD 0019: dry-run adapters must not produce side effects.
- SDD 0020: JSONL evidence persists Harness decisions.
- SDD 0021: file actions can be previewed without content reads or writes.
- Roadmap P5: Agent Harness requires permission, evidence, and rollback model before real control.

## Scope

In scope:

- Add a fallible Rust evidence sink boundary.
- Allow `JsonlEvidenceStore` to back dry-run evidence append.
- Return a dry-run report that includes whether evidence append succeeded.
- Surface typed evidence append errors.
- Prevent `would_execute=true` when durable evidence append fails.
- Keep the existing in-memory `DryRunHarness` unchanged for unit tests and rollback.

Out of scope:

- Real file/process/browser execution.
- Retrying failed appends.
- Evidence encryption or pruning.
- Database-backed evidence.
- Human approval queue execution.

## Contracts

This slice reuses:

- `contracts/harness/audit-evidence.schema.json`
- `contracts/harness/permission-manifest.current.json`

Rust API:

- `EvidenceSink`
- `PersistentDryRunHarness`
- `PersistentDryRunReport`

## Acceptance Criteria

- Rust tests prove an allowed request appends JSONL evidence and remains execution-ready.
- Rust tests prove a denied request is still persisted and not execution-ready.
- Rust tests prove an approval-required request is persisted and not execution-ready.
- Rust tests prove an append IO failure is surfaced and disables execution readiness.
- Structure verification requires SDD 0022 and persistent dry-run tests.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove `EvidenceSink`, `PersistentDryRunHarness`, `PersistentDryRunReport`, and the persistent dry-run tests. The in-memory dry-run harness, JSONL evidence store, and filesystem metadata dry-run remain valid.

## Observability And Performance Evidence

Record:

- failing test evidence before implementation.
- targeted Rust test result after implementation.
- strict quality gate result.
- confirmation that durable evidence append failure is visible and blocks execution readiness.
