# P5 Agent Harness Persistent Dry-Run Evidence

## Decision

Agent Harness now has a persistent dry-run facade that writes audit evidence through JSONL and surfaces append failures.

This stays inside the safety boundary:

- it evaluates permissions before reporting execution readiness.
- it appends audit evidence before `would_execute=true`.
- it keeps denied and approval-required decisions durable.
- it exposes typed append errors.
- it sets `would_execute=false` when durable evidence append fails.
- it does not perform real file, process, or browser actions.

## Root Requirement Link

The root requirements make local desktop control and remote social command entry core capabilities. This slice strengthens the pre-execution safety model: no future local action should be considered ready unless the Harness can preserve reviewable evidence first.

## Implemented Behavior

- `EvidenceSink` defines a fallible append boundary for durable evidence.
- `JsonlEvidenceStore` implements `EvidenceSink`.
- `PersistentDryRunHarness` evaluates requests and appends evidence through a fallible store.
- `PersistentDryRunReport` returns the decision, evidence status, optional typed error, and execution readiness.
- Durable append failure keeps the decision visible but disables execution readiness.

## TDD Evidence

The new persistent dry-run tests failed before implementation because `PersistentDryRunHarness` did not exist:

- unresolved import `agent_harness::PersistentDryRunHarness`.

After implementation, the targeted test passed:

```powershell
cargo test --manifest-path services/agent-harness/Cargo.toml --test persistent_dry_run_evidence
```

Result:

- 4 persistent dry-run evidence tests passed.

## Quality Gate Update

The structure gate now requires:

- `docs/sdd/0022-agent-harness-persistent-dry-run-evidence.md`
- `services/agent-harness/tests/persistent_dry_run_evidence.rs`

## Verification

Targeted:

- `cargo test --manifest-path services/agent-harness/Cargo.toml --test persistent_dry_run_evidence`: passed.

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
- quality elapsed: `138752ms`.

## Rollback

Remove `EvidenceSink`, `PersistentDryRunHarness`, `PersistentDryRunReport`, and `persistent_dry_run_evidence.rs`. The in-memory dry-run harness, JSONL evidence store, and filesystem metadata dry-run remain valid.

## Next Evidence

Next Harness slice should add persistent filesystem metadata dry-run so a reviewer can get both JSONL evidence and metadata preview in one durable path while still avoiding content reads and writes.
