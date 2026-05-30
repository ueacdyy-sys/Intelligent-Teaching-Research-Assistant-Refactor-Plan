# P5 Agent Harness Rollback Review

## Slice

- SDD: `docs/sdd/0070-agent-harness-rollback-review.md`
- Root requirement anchor: the coordinating assistant can control desktop applications, and mobile/social commands can ask the desktop assistant to act on the computer.
- Existing refactor evidence: Agent Harness already has permission, evidence, approval, queue, execution-candidate, and contract-flow gates.

## Contract

- Added `contracts/harness/rollback-review.schema.json`.
- Added `contracts/harness/rollback-review.example.json`.
- Added `services/agent-harness/src/rollback_review.rs`.
- Added `services/agent-harness/tests/rollback_review.rs`.
- Exported `RollbackReviewReport` and `RollbackReviewState` from the Rust crate.
- Added SDD 0070 and structure verification entries.

The rollback review report:

- keeps `localExecutionEnabled=false`.
- keeps `evidenceRetentionRequired=true`.
- reports `NO_LOCAL_SIDE_EFFECTS_READY` for correlated review-only queues.
- reports `REVIEW_BLOCKED_UNCORRELATED_DECISIONS` for uncorrelated decisions.
- reports `ROLLBACK_BLOCKED_EXECUTION_CANDIDATES_PRESENT` if any execution candidate is present.
- always includes the action `keep local execution disabled`.

## Red Evidence

`npm run verify:structure` failed before implementation with the expected missing file:

- `services/agent-harness/src/rollback_review.rs`

`cargo test --manifest-path services/agent-harness/Cargo.toml --test rollback_review` failed before implementation with:

- unresolved imports `agent_harness::RollbackReviewReport`
- unresolved imports `agent_harness::RollbackReviewState`

During the first full quality run, the strict gate failed because `tools/verify-structure.mjs` reached 803 lines while the limit is 800. The structure entries were mechanically compacted without relaxing the limit; the file now has 799 lines.

## Green Evidence

- `npm run verify:structure`: PASS
- `cargo test --manifest-path services/agent-harness/Cargo.toml --test rollback_review`: PASS, 4 tests
- `npm test`: PASS
- `npm run quality`: PASS, 14.3s
- `tools/verify-structure.mjs` line count: `799`
- `services/agent-harness/target` cleanup check: `False`

Latest `reports/quality-gate.current.json`:

- allPassed: `true`
- elapsedMs: `14284`
- npm test: PASS, 7035ms
- go vet: PASS, 1229ms
- cargo test: PASS, 889ms
- identity session runtime audit: PASS, 803ms
- identity access contract audit: PASS, 741ms
- student app flow audit: PASS, 709ms
- agent harness flow audit: PASS, 736ms
- direct-limited connection budget: PASS, 761ms
- pgbouncer connection budget: PASS, 701ms

## Design Notes

- This slice adds a rollback review projection only; it does not perform rollback actions.
- Real local execution remains disabled and candidate projection remains blocked by the existing execution-candidate contract.
- The report is intentionally derived from queue and execution-candidate views so reviewers can see the source state used to decide rollback readiness.
- No SQL table, package dependency, OCR/RAG/model, or training dependency was added.
