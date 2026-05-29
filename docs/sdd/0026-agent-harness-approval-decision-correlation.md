# SDD 0026: Agent Harness Approval Decision Correlation

## Problem

Agent Harness can persist pending approval artifacts and local approval decisions, but a later review path still needs a contract-shaped way to prove each decision maps back to the original pending artifact.

Without this correlation step, a standalone approval decision JSONL record could be misread as trustworthy execution input even when the source approval artifact is missing, duplicated, or context-mismatched. Approval decisions must remain review evidence, not execution grants.

## Source Requirement References

- Root requirement: mobile social commands can ask the desktop assistant to control local applications.
- Root requirement: local application control must be routed through the coordinating assistant.
- SDD 0016: remote command grants must be replay-guarded.
- SDD 0024: approval-required Harness decisions become pending approval artifacts.
- SDD 0025: approval decisions are durable review records with `executionReady=false`.
- Roadmap P5: Agent Harness requires permission, evidence, approval, and rollback model before real control.

## Scope

In scope:

- Add an approval decision correlation report JSON contract.
- Add a pure Rust correlation function for approval artifacts and approval decisions.
- Mark a decision as correlated only when its `approvalId` maps to exactly one pending artifact.
- Verify requester, action, target, and source status against the source approval artifact.
- Mark decisions with `executionReady=true` as uncorrelated.
- Detect missing source approval artifacts.
- Detect duplicate source approval artifact IDs.
- Detect mismatched decision context.
- Keep the report as review evidence only.

Out of scope:

- Real local action execution.
- Marking approvals as consumed.
- Database-backed queues.
- Human approval UI.
- Signature, encryption, retention, or pruning.
- Changing the SDD 0024/0025 artifact formats.

## Contracts

New contracts:

- `contracts/harness/approval-decision-correlation.schema.json`
- `contracts/harness/approval-decision-correlation.example.json`

Rust API:

- `ApprovalDecisionCorrelationStatus`
- `ApprovalDecisionCorrelationEntry`
- `ApprovalDecisionCorrelationReport`
- `correlate_approval_decisions`

## Acceptance Criteria

- Rust tests prove a matching approval decision correlates to exactly one pending approval artifact.
- Rust tests prove a decision without a source approval artifact is marked `MISSING_APPROVAL`.
- Rust tests prove duplicate approval artifact IDs are marked `DUPLICATE_APPROVAL_ID`.
- Rust tests prove mismatched requester, action, or target is marked `CONTEXT_MISMATCH`.
- Correlation implementation also checks `sourceStatus` against the source artifact status.
- Rust tests prove `executionReady=true` is marked `EXECUTION_READY_DECISION`.
- Rust tests prove correlation reports serialize to the contract shape.
- Structure verification requires SDD 0026, correlation contracts, and correlation tests.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove the approval decision correlation contract, Rust correlation module, correlation tests, SDD 0026 structure checks, and README references. Approval artifacts and approval decisions remain valid review records.

## Observability And Performance Evidence

Record:

- failing test evidence before implementation.
- targeted Rust test result after implementation.
- strict quality gate result.
- confirmation that correlation is pure review evidence and does not execute local actions.
