# P5 Agent Harness Filesystem Metadata Dry-Run

## Decision

Agent Harness now has a metadata-only filesystem dry-run report for file targets.

This stays inside the safety boundary:

- it evaluates permission before probing metadata.
- it appends audit evidence for every metadata dry-run request.
- it reports metadata only for `ALLOW_DRY_RUN`.
- it does not read file contents.
- it does not write files.
- it does not create missing targets or parent directories.
- it does not start processes or drive a browser.

## Root Requirement Link

The root requirements make the coordinating assistant responsible for local desktop control and remote social command entry. This slice moves that capability forward by making file actions reviewable before real execution exists.

## Implemented Behavior

- `DryRunHarness::dry_run_file_metadata` handles `FILE_READ` and `FILE_WRITE` requests.
- `FileMetadataReport` returns the normalized target, matched manifest rule ID, decision outcome, evidence ID, and metadata fields.
- `FileTargetKind` distinguishes file, directory, symlink, missing, other, and unchecked targets.
- Filesystem metadata is collected only after `ALLOW_DRY_RUN`.
- `APPROVAL_REQUIRED` and `DENY` requests append evidence but leave filesystem metadata unchecked.

## TDD Evidence

The new filesystem metadata tests failed before implementation because `FileTargetKind` and `dry_run_file_metadata` did not exist:

- unresolved import `agent_harness::FileTargetKind`.
- no method named `dry_run_file_metadata`.

After implementation, the targeted test passed:

```powershell
cargo test --manifest-path services/agent-harness/Cargo.toml --test filesystem_metadata_dry_run
```

Result:

- 4 filesystem metadata dry-run tests passed.

## Quality Gate Update

The structure gate now requires:

- `docs/sdd/0021-agent-harness-filesystem-metadata-dry-run.md`
- `services/agent-harness/tests/filesystem_metadata_dry_run.rs`

## Verification

Targeted:

- `cargo test --manifest-path services/agent-harness/Cargo.toml --test filesystem_metadata_dry_run`: passed.

Daily:

- `npm test`: passed.

Strict quality gate:

- `npm test`: passed.
- `go vet`: passed.
- `cargo test`: passed.
- identity session runtime audit: passed.
- identity access contract audit: passed.
- direct-limited connection budget: passed.
- PgBouncer connection budget: passed.
- `allPassed=true`.
- quality elapsed: `138716ms`.

## Rollback

Remove `DryRunHarness::dry_run_file_metadata`, `FileMetadataReport`, `FileTargetKind`, and `filesystem_metadata_dry_run.rs`. The permission evaluator, evidence model, in-memory store, JSONL store, and generic dry-run facade remain valid.

## Next Evidence

Next Harness slice should add a fallible evidence store boundary so dry-run reports can persist through `JsonlEvidenceStore` without losing IO error visibility.
