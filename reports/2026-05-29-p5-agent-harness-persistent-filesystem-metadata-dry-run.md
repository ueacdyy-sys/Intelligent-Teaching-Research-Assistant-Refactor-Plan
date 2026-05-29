# P5 Agent Harness Persistent Filesystem Metadata Dry-Run

## Decision

Agent Harness now has a persistent filesystem metadata dry-run path.

This combines the previous safety layers:

- permission decision happens first.
- JSONL evidence append happens before metadata probing.
- metadata is returned only when the decision is `ALLOW_DRY_RUN` and evidence append succeeds.
- append failure disables execution readiness and keeps metadata unchecked.
- approval-required requests are persisted but still metadata-unchecked.
- no file content is read.
- no file or parent directory is created for the requested target.

## Root Requirement Link

The root requirements make local desktop control and remote social command entry core capabilities. This slice makes future file control reviewable after process exit while preserving the rule that pre-execution evidence must exist before local filesystem probing.

## Implemented Behavior

- `PersistentDryRunHarness::dry_run_file_metadata` handles `FILE_READ` and `FILE_WRITE`.
- `PersistentFileMetadataReport` returns decision, evidence status, optional typed append error, matched manifest rule, normalized target, and metadata fields.
- A shared filesystem metadata probe is reused by both in-memory and persistent metadata dry-run paths.
- Metadata is probed only when `would_execute=true`.

## TDD Evidence

The new persistent filesystem metadata tests failed before implementation because `PersistentDryRunHarness` did not expose `dry_run_file_metadata`:

- no method named `dry_run_file_metadata` found for `PersistentDryRunHarness<JsonlEvidenceStore>`.

After implementation, the targeted test passed:

```powershell
cargo test --manifest-path services/agent-harness/Cargo.toml --test persistent_filesystem_metadata_dry_run
```

Result:

- 4 persistent filesystem metadata dry-run tests passed.

## Quality Gate Update

The structure gate now requires:

- `docs/sdd/0023-agent-harness-persistent-filesystem-metadata-dry-run.md`
- `services/agent-harness/tests/persistent_filesystem_metadata_dry_run.rs`

## Verification

Targeted:

- `cargo test --manifest-path services/agent-harness/Cargo.toml --test persistent_filesystem_metadata_dry_run`: passed.

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
- quality elapsed: `139389ms`.

## Rollback

Remove `PersistentDryRunHarness::dry_run_file_metadata`, `PersistentFileMetadataReport`, and `persistent_filesystem_metadata_dry_run.rs`. Keep the in-memory metadata dry-run, generic persistent dry-run, and JSONL evidence store.

## Next Evidence

Next Harness slice should introduce an explicit approval artifact for approval-required decisions so remote social commands can be reviewed and later approved without granting direct local control.
