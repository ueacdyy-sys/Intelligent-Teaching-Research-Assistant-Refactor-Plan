# P5 Agent Harness JSONL Evidence Store

## Decision

Agent Harness now has a local append-only JSONL evidence store for audit records.

This stays inside the safety boundary:

- it persists evidence records only.
- it does not read or write user files through a Harness action.
- it does not start processes.
- it does not drive a browser.
- it does not add a database dependency to the Rust local runtime.

## Root Requirement Link

The root requirements allow the assistant to control desktop applications through the orchestrating agent. Before real control exists, Harness decisions must survive process exit so approval and rollback review can inspect what would have happened.

## Implemented Behavior

- `JsonlEvidenceStore` appends one `AuditEvidence` JSON object per line.
- Parent directories are created automatically.
- `read_all()` returns records in append order.
- Invalid JSONL returns `EvidenceStoreError::Json`.
- IO failures return `EvidenceStoreError::Io`.

## TDD Evidence

The new JSONL tests failed before implementation because `JsonlEvidenceStore` and `EvidenceStoreError` did not exist.

After implementation, `cargo test --manifest-path services/agent-harness/Cargo.toml` passed with 16 Rust tests:

- 4 permission manifest tests.
- 4 audit evidence tests.
- 4 dry-run harness tests.
- 4 JSONL evidence store tests.

## Quality Gate Update

The structure gate now requires:

- `docs/sdd/0020-agent-harness-jsonl-evidence-store.md`
- `services/agent-harness/tests/jsonl_evidence_store.rs`

## Verification

Targeted:

```powershell
cargo test --manifest-path services/agent-harness/Cargo.toml
```

Result:

- 16 Rust tests passed.

Full gates are recorded in `reports/quality-gate.current.json` after the final quality run.

Strict quality gate:

- `npm test`: passed.
- `go vet`: passed.
- `cargo test`: passed.
- identity session runtime audit: passed.
- identity access contract audit: passed.
- direct-limited connection budget: passed.
- PgBouncer connection budget: passed.
- `allPassed=true`.
- quality elapsed: `161011ms`.

## Rollback

Remove `JsonlEvidenceStore`, `EvidenceStoreError`, and `jsonl_evidence_store.rs`. The in-memory evidence store and dry-run facade remain valid.

## Next Evidence

Next Harness slice should wire `JsonlEvidenceStore` into a local runtime configuration path or add a dry-run filesystem metadata adapter that records evidence without modifying user files.
