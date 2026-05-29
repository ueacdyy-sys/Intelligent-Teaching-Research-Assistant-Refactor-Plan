# SDD 0023: Agent Harness Persistent Filesystem Metadata Dry-Run

## Problem

Agent Harness now has a metadata-only file dry-run and a persistent JSONL dry-run evidence path, but reviewers still need a single operation that produces both durable evidence and a safe file metadata preview.

Before real local file control exists, the Harness must prove that a file preview can be reviewed after process exit. Metadata probing must happen only after the request is allowed and durable evidence is written.

## Source Requirement References

- Root requirement: the coordinating assistant can control desktop applications and accept remote social commands.
- SDD 0000: external application control must pass through Agent Harness.
- SDD 0018: Harness decisions become audit evidence.
- SDD 0019: dry-run adapters must not produce side effects.
- SDD 0020: JSONL evidence persists Harness decisions.
- SDD 0021: file actions can be previewed without content reads or writes.
- SDD 0022: durable evidence append failure disables execution readiness.
- Roadmap P5: Agent Harness requires permission, evidence, and rollback model before real control.

## Scope

In scope:

- Add persistent filesystem metadata dry-run for `FILE_READ` and `FILE_WRITE`.
- Append JSONL audit evidence before probing filesystem metadata.
- Return metadata only when the decision is `ALLOW_DRY_RUN` and evidence append succeeds.
- Keep denied, approval-required, and append-failed requests metadata-unchecked.
- Report the matched manifest rule ID, normalized target, target existence, parent existence, and target kind.
- Prove no file content is read and no target is created.

Out of scope:

- Real file reads or writes.
- Process or browser metadata previews.
- Retrying failed evidence appends.
- Database-backed evidence.
- Human approval queue execution.

## Contracts

This slice reuses:

- `contracts/harness/permission-manifest.current.json`
- `contracts/harness/audit-evidence.schema.json`

Rust API:

- `PersistentDryRunHarness::dry_run_file_metadata`
- `PersistentFileMetadataReport`

## Acceptance Criteria

- Rust tests prove an allowed existing file appends JSONL evidence and returns metadata.
- Rust tests prove an allowed missing write target is not created.
- Rust tests prove approval-required requests persist evidence but keep metadata unchecked.
- Rust tests prove append IO failure keeps metadata unchecked and disables execution readiness.
- Structure verification requires SDD 0023 and persistent filesystem metadata tests.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove `PersistentDryRunHarness::dry_run_file_metadata`, `PersistentFileMetadataReport`, and the persistent filesystem metadata tests. The generic persistent dry-run, JSONL evidence store, and in-memory metadata dry-run remain valid.

## Observability And Performance Evidence

Record:

- failing test evidence before implementation.
- targeted Rust test result after implementation.
- strict quality gate result.
- confirmation that durable evidence append precedes metadata probing.
