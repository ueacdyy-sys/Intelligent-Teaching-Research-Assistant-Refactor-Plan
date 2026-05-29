# P5 Agent Harness Approval Queue Reader Evidence

Date: 2026-05-29

## Decision Summary

SDD 0027 adds a typed JSONL approval queue reader. The reader loads approval
artifact and approval decision streams together, runs approval decision
correlation, and emits a review-only queue snapshot.

The snapshot keeps `executionCandidateCount=0` for both matched and uncorrelated
records. Missing JSONL streams are treated as empty queues, while malformed
existing JSONL streams still return typed JSON errors.

## TDD Red Evidence

Before implementation, the new test target failed as expected:

```text
error[E0432]: unresolved imports
`agent_harness::ApprovalQueueSnapshot`,
`agent_harness::JsonlApprovalQueueReader`
```

After the first implementation, tests exposed a real queue semantics issue:
missing JSONL streams returned IO errors before malformed decision JSONL could be
validated. The reader was corrected so missing streams mean empty queues and
existing malformed streams still fail as JSON errors.

## Targeted Test Evidence

Command:

```powershell
cargo test --manifest-path services/agent-harness/Cargo.toml --test approval_queue_reader
```

Result:

```text
test result: ok. 5 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

Covered behavior:

- Reader loads persisted approvals and decisions together.
- Reader runs correlation and reports a matched decision.
- Uncorrelated decisions are counted and still produce no execution candidates.
- Invalid approval JSONL returns typed JSON errors.
- Invalid decision JSONL returns typed JSON errors.
- Queue snapshots serialize to the contract shape.

## Strict Quality Gate

Command:

```powershell
npm run quality
```

Latest quality report:

- `allPassed=true`
- `elapsedMs=138994`
- `generatedAt=2026-05-29T04:36:02.855Z`

Passed checks:

- `npm test`
- `go vet`
- `cargo test`
- identity session runtime audit
- identity access contract audit
- direct-limited connection budget
- PgBouncer connection budget

## Architecture And Safety Review

- The reader is a Rust boundary object over JSONL stores and pure correlation.
- It reuses `JsonlApprovalStore`, `JsonlApprovalDecisionStore`, and
  `correlate_approval_decisions` instead of duplicating parsing or matching
  logic.
- It does not import HTTP, database, process, browser, or filesystem action
  adapters.
- The output is a contract-shaped review snapshot, not an execution command.
- Missing, malformed, or uncorrelated review state cannot produce execution
  candidates.

Clean Architecture score: 9/10.

To reach 10/10, the next slice should add a separate execution-candidate
contract that remains empty unless future SDDs explicitly prove every execution
precondition. For now, execution remains disabled.

## Rollback

Remove:

- `docs/sdd/0027-agent-harness-approval-queue-reader.md`
- `contracts/harness/approval-queue-snapshot.schema.json`
- `contracts/harness/approval-queue-snapshot.example.json`
- `services/agent-harness/src/approval_queue.rs`
- `services/agent-harness/tests/approval_queue_reader.rs`
- SDD 0027 structure requirements and README references

Approval artifacts, approval decisions, and correlation reports remain valid
review records.

## Next Evidence

Next P5 slice should keep execution disabled and define a blocked
execution-candidate view whose empty state is contract-tested. That gives future
execution work a place to add preconditions without weakening the current safety
boundary.
