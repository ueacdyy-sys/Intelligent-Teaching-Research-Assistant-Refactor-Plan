# SDD 0018: Agent Harness Audit Evidence

## Problem

SDD 0017 added a Rust Agent Harness permission evaluator, but its decisions are still transient return values. The root requirements allow the assistant to control desktop applications, so every Harness decision must become auditable before any real file, process, or browser adapter is introduced.

Without a stable evidence record, approval flows, rollback reviews, and incident analysis would depend on logs or UI state instead of a contract.

## Source Requirement References

- Root requirement: the assistant can control desktop applications through the orchestrating agent.
- SDD 0000: external application control must pass through Agent Harness.
- SDD 0006: remote command grants require Harness approval before local control.
- SDD 0017: Agent Harness now returns allow, approval-required, and deny decisions for dry-run actions.
- Roadmap P5: Agent Harness requires permission, evidence, and rollback model.

## Scope

In scope:

- Add a contract for Harness audit evidence records.
- Add Rust types that serialize evidence records to the contract shape.
- Capture decision outcome, reason, dry-run flag, principal/session identifiers, action, target, and manifest version.
- Add an in-memory evidence store for unit and local dry-run tests.
- Keep evidence storage append-only in this slice.

Out of scope:

- Durable disk or database persistence.
- Human approval queues.
- Real local file/process/browser execution.
- Evidence export UI.

## Contracts

- `contracts/harness/audit-evidence.schema.json`
- `contracts/harness/audit-evidence.example.json`
- Rust type: `AuditEvidence`
- Rust boundary: `EvidenceStore`

Evidence outcomes use the same public decision vocabulary as the permission evaluator:

- `ALLOW_DRY_RUN`
- `APPROVAL_REQUIRED`
- `DENY`

## Acceptance Criteria

- Rust tests prove an allow decision creates evidence with `dryRun=true`.
- Rust tests prove an approval-required decision creates evidence with `dryRun=false`.
- Rust tests prove evidence serializes to camelCase JSON matching the contract vocabulary.
- Rust tests prove the in-memory store preserves append order.
- Structure verification requires SDD 0018 and evidence contracts.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove the evidence schema files and Rust evidence types/store. The permission evaluator can continue returning decisions without persistence because no runtime route depends on evidence storage yet.

## Observability And Performance Evidence

Record:

- quality gate result.
- evidence behavior for allow, approval-required, and deny.
- future durable evidence write latency once a persistent store is introduced.

