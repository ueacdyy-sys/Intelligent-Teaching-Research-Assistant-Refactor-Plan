# P5 Agent Harness Audit Evidence

## Decision

Agent Harness dry-run decisions now produce contract-shaped audit evidence records before any real desktop control adapter exists.

The slice keeps the local trust boundary small:

- `AuditEvidence` serializes to a stable camelCase JSON contract.
- `DecisionOutcome` and `ActionKind` use the same public vocabulary as the permission manifest.
- `InMemoryEvidenceStore` is append-only and preserves order for tests and local dry-run flows.
- No file, process, browser, shell, database, or desktop automation is introduced.

## Root Requirement Link

The root requirements allow the assistant to control desktop applications through the orchestrating agent. Evidence is part of the safety boundary: local control decisions must be explainable before they can become executable.

## Implemented Contract

- `contracts/harness/audit-evidence.schema.json`
- `contracts/harness/audit-evidence.example.json`
- `services/agent-harness::AuditEvidence`
- `services/agent-harness::EvidenceStore`
- `services/agent-harness::InMemoryEvidenceStore`

Captured fields:

- evidence ID
- recorded timestamp
- principal ID
- session ID
- action
- target
- decision outcome
- reason
- dry-run flag
- manifest schema version

## TDD Evidence

The new Rust tests failed before implementation because the public evidence API did not exist:

- `AuditEvidence`
- `InMemoryEvidenceStore`
- `Principal::with_context`

After implementation:

- allow decisions create `dryRun=true` evidence.
- approval-required decisions create `dryRun=false` evidence.
- evidence serializes as contract-shaped camelCase JSON.
- the in-memory store preserves append order.

## Quality Gate Update

The structure gate now requires SDD 0018 and both audit evidence contract files.

The strict quality source collector now skips Rust `target` build output so generated build artifacts cannot trigger runtime marker or source-size checks after local Cargo runs.

## Verification

Targeted:

```powershell
cargo test --manifest-path services/agent-harness/Cargo.toml
```

Result:

- 8 Rust tests passed.

Full gates are recorded in `reports/quality-gate.current.json` after the final quality run.

Latest strict quality result:

- `npm test`: passed.
- `go vet`: passed.
- `cargo test`: passed.
- identity session runtime audit: passed.
- identity access contract audit: passed.
- direct-limited connection budget: passed.
- PgBouncer connection budget: passed.
- `allPassed=true`
- quality elapsed: `138690ms`

## Rollback

Remove the evidence contract files, the Rust evidence types/store, and the SDD/report. The permission manifest evaluator remains usable because no runtime route depends on evidence persistence yet.

## Next Evidence

Next Harness slice should persist evidence to a durable local store or add dry-run file/process adapter evidence without performing real local control.
