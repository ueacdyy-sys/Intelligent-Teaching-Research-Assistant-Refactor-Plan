# P5 Agent Harness Approval Decision Correlation Evidence

Date: 2026-05-29

## Decision Summary

SDD 0026 adds a review-only correlation report for Agent Harness approval
decisions. A decision is correlated only when its `approvalId` maps to exactly
one pending source approval artifact and its requester, action, target, and
source status still match that artifact.

The report rejects missing source artifacts, duplicate source IDs, context
mismatches, and any decision record with `executionReady=true`. It does not
execute local actions or convert approval into execution readiness.

## TDD Red Evidence

Before implementation, the new test target failed as expected:

```text
error[E0432]: unresolved imports
`agent_harness::ApprovalDecisionCorrelationStatus`,
`agent_harness::correlate_approval_decisions`
```

This red test proved the correlation API did not exist before production code
was added.

## Targeted Test Evidence

Command:

```powershell
cargo test --manifest-path services/agent-harness/Cargo.toml --test approval_decision_correlation
```

Result:

```text
test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

Covered behavior:

- Matching decision correlates to one pending approval artifact.
- Missing source approval is marked `MISSING_APPROVAL`.
- Duplicate source approval IDs are marked `DUPLICATE_APPROVAL_ID`.
- Requester, action, and target mismatches are marked `CONTEXT_MISMATCH`.
- `executionReady=true` is marked `EXECUTION_READY_DECISION`.
- Correlation reports serialize to the contract shape.

## Strict Quality Gate

Command:

```powershell
npm run quality
```

Latest quality report:

- `allPassed=true`
- `elapsedMs=139034`
- `generatedAt=2026-05-29T04:25:13.693Z`

Passed checks:

- `npm test`
- `go vet`
- `cargo test`
- identity session runtime audit
- identity access contract audit
- direct-limited connection budget
- PgBouncer connection budget

## Architecture And Safety Review

- Correlation is a pure Rust domain function over approval artifacts and
  approval decisions.
- The function does not import HTTP, database, process, browser, or filesystem
  adapters.
- The output is contract-shaped review evidence, not an execution command.
- Missing, duplicated, mismatched, or execution-ready records keep
  `allCorrelated=false`.
- No remote principal is granted local-control scope by correlation.

Clean Architecture score: 9/10.

To reach 10/10, the next slice should add a typed reader that loads approval and
decision JSONL records together, runs correlation, and refuses to produce any
execution-candidate view while uncorrelated decisions exist.

## Rollback

Remove:

- `docs/sdd/0026-agent-harness-approval-decision-correlation.md`
- `contracts/harness/approval-decision-correlation.schema.json`
- `contracts/harness/approval-decision-correlation.example.json`
- `services/agent-harness/src/approval_correlation.rs`
- `services/agent-harness/tests/approval_decision_correlation.rs`
- SDD 0026 structure requirements and README references

Approval artifacts and approval decisions remain valid review records.

## Next Evidence

Next P5 slice should keep execution disabled and add a combined approval queue
reader that reads persisted approval artifacts plus decision JSONL, emits this
correlation report, and proves no execution candidate is created from
uncorrelated records.
