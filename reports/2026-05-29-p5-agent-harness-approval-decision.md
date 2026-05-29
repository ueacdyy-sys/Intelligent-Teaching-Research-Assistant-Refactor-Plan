# P5 Agent Harness Approval Decision Evidence

Date: 2026-05-29

## Decision Summary

SDD 0025 adds a durable Agent Harness approval decision record. A local reviewer
with `HARNESS_APPROVE` can record `APPROVED` or `REJECTED` for a pending
approval artifact, but the decision remains review evidence only:
`executionReady=false`.

The slice also closes a review-time safety gap: a principal that still requires
Harness approval cannot create approval decisions, even if it carries
`HARNESS_APPROVE`.

## TDD Red Evidence

Before implementation, the new test
`remote_reviewer_with_harness_approve_cannot_create_decision` failed as expected:

```text
error[E0599]: no variant or associated item named `ReviewerRequiresHarnessApproval`
found for enum `ApprovalDecisionError`
```

This red test proved the missing safety rule before production code was added.

## Targeted Test Evidence

Command:

```powershell
cargo test --manifest-path services/agent-harness/Cargo.toml --test approval_decision
```

Result:

```text
test result: ok. 7 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

Covered behavior:

- Local reviewer with `HARNESS_APPROVE` can approve.
- Local reviewer with `HARNESS_APPROVE` can reject.
- Reviewer without `HARNESS_APPROVE` is denied.
- Reviewer still requiring Harness approval is denied, even with
  `HARNESS_APPROVE`.
- Approval decisions serialize to the JSON contract shape.
- Approval decisions keep `executionReady=false`.
- Approval decision JSONL appends and reads in order.
- Invalid approval decision JSONL returns typed JSON errors.

## Strict Quality Gate

Command:

```powershell
npm run quality
```

Latest quality report:

- `allPassed=true`
- `elapsedMs=138981`
- `generatedAt=2026-05-29T04:14:49.029Z`

Passed checks:

- `npm test`
- `go vet`
- `cargo test`
- identity session runtime audit
- identity access contract audit
- direct-limited connection budget
- PgBouncer connection budget

## Architecture And Safety Review

- Approval decisions depend on existing Harness domain contracts rather than
  file, process, browser, HTTP, or database adapters.
- `ApprovalDecision` copies the pending approval context for durable review
  evidence and does not mutate the source approval artifact.
- `JsonlApprovalDecisionStore` persists append-only JSONL records and reuses the
  shared typed JSON/IO error path.
- No local action is executed by approval or rejection.
- No remote principal receives local-control scope as part of a decision.

## Rollback

Remove:

- `contracts/harness/approval-decision.schema.json`
- `contracts/harness/approval-decision.example.json`
- `services/agent-harness/src/approval_decision.rs`
- `services/agent-harness/tests/approval_decision.rs`
- SDD 0025 structure requirements and README references

Pending approval artifacts from SDD 0024 remain valid.

## Next Evidence

Next P5 slice should keep execution disabled and add an approval queue reader or
decision correlation view that proves each approval decision maps to an existing
pending artifact before any future execution-ready design is considered.
