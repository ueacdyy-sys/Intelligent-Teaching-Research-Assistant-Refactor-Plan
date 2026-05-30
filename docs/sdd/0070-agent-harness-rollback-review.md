# SDD 0070: Agent Harness Rollback Review

## Problem

Agent Harness now has permission, evidence, approval, queue, execution-candidate,
and contract-flow gates. The whole-system module map still requires every
migrated module to keep a rollback route until the new path is proven with
current evidence. For local application control, rollback must be explicit
before real execution exists, because the safest rollback state is "no local side
effects have been enabled."

Without a contract-shaped rollback review, later work could treat approval queue
success as execution readiness, skip correlation issues, or enable local actions
without a review artifact that says what must be preserved, blocked, or reverted.

## Source Requirement References

- Root requirement: the coordinating assistant can control desktop applications.
- Root requirement: mobile/social commands can ask the desktop assistant to act
  on the computer.
- SDD 0000: external application control must pass through Agent Harness.
- SDD 0027: approval queues are review-only and keep execution candidates
  disabled.
- SDD 0028: execution candidate views expose no candidates until a future SDD
  explicitly enables them.
- SDD 0069: Agent Harness contract flow gate keeps real local execution disabled.
- Whole-system module map: every migrated module keeps a rollback route until
  the new path is proven with current evidence.

## Scope

In scope:

- Add a rollback review JSON contract.
- Add a Rust rollback review projection from approval queue snapshots and
  execution candidate views.
- Preserve source queue/view timestamps and counts for review traceability.
- Keep `localExecutionEnabled=false`.
- Mark correlated, zero-candidate queues as `NO_LOCAL_SIDE_EFFECTS_READY`.
- Mark uncorrelated queues as `REVIEW_BLOCKED_UNCORRELATED_DECISIONS`.
- Mark any nonzero execution-candidate projection as
  `ROLLBACK_BLOCKED_EXECUTION_CANDIDATES_PRESENT`.
- Emit required rollback actions that explain what reviewers must preserve or
  resolve.

Out of scope:

- Performing rollback actions.
- Enabling real local execution.
- Consuming approval decisions.
- Modifying approval, decision, or evidence JSONL records.
- Human approval UI.

## Contracts

New contracts:

- `contracts/harness/rollback-review.schema.json`
- `contracts/harness/rollback-review.example.json`

Rust API:

- `RollbackReviewReport`
- `RollbackReviewState`

## Acceptance Criteria

- Rust tests prove a matched review-only queue becomes
  `NO_LOCAL_SIDE_EFFECTS_READY` with `localExecutionEnabled=false`.
- Rust tests prove uncorrelated decisions block rollback review and require
  correlation resolution.
- Rust tests prove any execution candidate count blocks rollback review.
- Rust tests prove rollback review reports serialize to the contract shape.
- Structure verification requires SDD 0070, rollback review contracts, Rust
  module, and tests.
- `npm test` passes.
- `npm run quality` passes.
- No package dependency, SQL table, OCR/RAG/model, or training dependency is
  added.

## Rollback

Remove `RollbackReviewReport`, `RollbackReviewState`, rollback review contracts,
rollback review tests, SDD 0070 structure checks, and this SDD. Existing
permission, evidence, approval, queue, execution-candidate, and flow-gate
contracts remain unchanged.

## Observability And Performance Evidence

Record:

- failing structure and Rust test evidence before implementation.
- targeted Rust test result after implementation.
- full `npm test` result.
- strict `npm run quality` result.
- confirmation that rollback review performs no local side effects and keeps
  local execution disabled.
