# SDD 0025: Agent Harness Approval Decision

## Problem

Agent Harness can create durable pending approval artifacts for remote local-control requests, but a local reviewer still has no contract-shaped way to approve or reject them.

The next safety step is a durable approval decision artifact. It must let a local reviewer express `APPROVED` or `REJECTED` for a pending request while still avoiding direct execution. Approval records are review decisions, not execution grants.

## Source Requirement References

- Root requirement: mobile social commands can ask the desktop assistant to control local applications.
- Root requirement: local application control must be routed through the coordinating assistant.
- SDD 0016: remote command grants must be replay-guarded.
- SDD 0017: permission manifests define Harness targets.
- SDD 0024: approval-required decisions become pending approval artifacts.
- Roadmap P5: Agent Harness requires permission, evidence, approval, and rollback model before real control.

## Scope

In scope:

- Add an approval decision JSON contract.
- Add Rust approval decision types for `APPROVED` and `REJECTED`.
- Require reviewer principal to have `HARNESS_APPROVE`.
- Reject reviewers that still require Harness approval themselves.
- Preserve the original requester, action, and target for review.
- Keep `executionReady=false` for approval decisions.
- Persist approval decisions as append-only JSONL.
- Read approval decisions back in append order.
- Return typed JSON/IO errors for approval decision store failures.

Out of scope:

- Real execution after approval.
- Human approval UI.
- Mutating the original approval artifact.
- Granting local-control scope to remote principals.
- Database-backed approval queue.
- Retention, signing, pruning, or encryption.

## Contracts

New contracts:

- `contracts/harness/approval-decision.schema.json`
- `contracts/harness/approval-decision.example.json`

Rust API:

- `ApprovalDecision`
- `ApprovalDecisionOutcome`
- `ApprovalDecisionError`
- `JsonlApprovalDecisionStore`

## Acceptance Criteria

- Rust tests prove a local reviewer with `HARNESS_APPROVE` can create an approved decision.
- Rust tests prove a local reviewer with `HARNESS_APPROVE` can create a rejected decision.
- Rust tests prove a principal without `HARNESS_APPROVE` cannot create a decision.
- Rust tests prove a remote or delegated reviewer that still requires Harness approval cannot create a decision, even with `HARNESS_APPROVE`.
- Rust tests prove approval decisions serialize to the contract shape and keep `executionReady=false`.
- Rust tests prove JSONL approval decision store appends and reads in order.
- Rust tests prove invalid approval decision JSONL returns a typed JSON error.
- Structure verification requires SDD 0025, approval decision contracts, and approval decision tests.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove `ApprovalDecision`, `ApprovalDecisionOutcome`, `ApprovalDecisionError`, `JsonlApprovalDecisionStore`, approval decision contracts, and approval decision tests. Pending approval artifacts remain valid.

## Observability And Performance Evidence

Record:

- failing test evidence before implementation.
- targeted Rust test result after implementation.
- strict quality gate result.
- confirmation that approval decisions do not execute local actions.
