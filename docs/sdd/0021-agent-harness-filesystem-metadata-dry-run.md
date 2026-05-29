# SDD 0021: Agent Harness Filesystem Metadata Dry-Run

## Problem

Agent Harness can decide whether a file action is allowed and can record audit evidence, but the approval path still lacks a safe preview of what a file action would touch.

Before real local file reads or writes exist, the Harness needs a metadata-only dry-run report. The report must help a local reviewer understand the target without reading file contents, creating files, starting processes, or navigating a browser.

## Source Requirement References

- Root requirement: the coordinating assistant can control desktop applications and accept remote social commands.
- SDD 0000: external application control must pass through Agent Harness.
- SDD 0017: permission manifests define allowed local targets.
- SDD 0018: Harness decisions become audit evidence.
- SDD 0019: dry-run adapters must not produce side effects.
- SDD 0020: JSONL evidence persists Harness decisions for review.
- Roadmap P5: Agent Harness requires permission, evidence, and rollback model before real control.

## Scope

In scope:

- Add a Rust filesystem metadata dry-run report for `FILE_READ` and `FILE_WRITE`.
- Return the normalized target path.
- Return the matched manifest file rule ID when the manifest allows the target.
- Report whether the target exists only after the request is allowed for dry-run.
- Report whether the parent directory exists only after the request is allowed for dry-run.
- Report the target kind as file, directory, symlink, missing, other, or unchecked.
- Append audit evidence for every metadata dry-run request.
- Prove the adapter does not read file contents or create missing targets.

Out of scope:

- Reading file contents.
- Writing files.
- Creating parent directories for requested file actions.
- Canonicalizing paths through symlink targets.
- Process or browser metadata dry-run.
- Human approval queue execution.

## Contracts

This slice reuses:

- `contracts/harness/permission-manifest.schema.json`
- `contracts/harness/permission-manifest.current.json`
- `contracts/harness/audit-evidence.schema.json`

Rust API:

- `DryRunHarness::dry_run_file_metadata`
- `FileMetadataReport`
- `FileTargetKind`

## Acceptance Criteria

- Rust tests prove an allowed existing file returns metadata without content access.
- Rust tests prove an allowed missing write target is not created.
- Rust tests prove a denied outside-manifest target stays unchecked.
- Rust tests prove approval-required requests record evidence without filesystem metadata access.
- Structure verification requires SDD 0021 and filesystem metadata tests.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove `DryRunHarness::dry_run_file_metadata`, `FileMetadataReport`, `FileTargetKind`, and the filesystem metadata tests. Existing permission, evidence, JSONL, and generic dry-run behavior remain valid.

## Observability And Performance Evidence

Record:

- failing test evidence before implementation.
- targeted Rust test result after implementation.
- strict quality gate result.
- confirmation that no real file content read/write path was introduced.
