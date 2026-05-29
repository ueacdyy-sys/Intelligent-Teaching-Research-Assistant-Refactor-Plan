# SDD 0024: Agent Harness Approval Artifact

## Problem

Remote social commands can submit work to the coordinating assistant, but they must not receive direct local control. Current Harness dry-run decisions can return `APPROVAL_REQUIRED`, yet there is no durable approval artifact that a local reviewer can inspect before granting execution.

The Harness needs a contract-shaped approval artifact for approval-required decisions. This artifact must be separate from execution and must preserve enough context to review who requested what, when, and under which manifest version.

## Source Requirement References

- Root requirement: mobile social commands can ask the desktop assistant to control local applications.
- Root requirement: the coordinating assistant routes commands to teaching, research, and local control capabilities.
- SDD 0000: external application control must pass through Agent Harness.
- SDD 0016: remote command grants must be replay-guarded.
- SDD 0017: permission manifests define allowed Harness targets.
- SDD 0018: Harness decisions become audit evidence.
- SDD 0022: durable evidence append failure disables execution readiness.
- SDD 0023: durable evidence precedes filesystem metadata probing.
- Roadmap P5: Agent Harness requires permission, evidence, approval, and rollback model before real control.

## Scope

In scope:

- Add an approval artifact JSON contract.
- Add a Rust `ApprovalArtifact` model.
- Add `ApprovalStatus::Pending`.
- Create artifacts only from `APPROVAL_REQUIRED` decisions.
- Persist approval artifacts as append-only JSONL.
- Read approval artifacts back in append order.
- Return typed JSON/IO errors for approval store failures.

Out of scope:

- Human approval UI.
- Approving, rejecting, or executing commands.
- Granting `DEVICE_LOCAL_CONTROL` to remote principals.
- Database-backed approval queue.
- Retention, pruning, encryption, or signing.

## Contracts

New contracts:

- `contracts/harness/approval-artifact.schema.json`
- `contracts/harness/approval-artifact.example.json`

Rust API:

- `ApprovalArtifact`
- `ApprovalStatus`
- `JsonlApprovalStore`

## Acceptance Criteria

- Rust tests prove approval-required decisions create pending approval artifacts.
- Rust tests prove allow and deny decisions do not create approval artifacts.
- Rust tests prove approval artifacts serialize to the contract shape.
- Rust tests prove JSONL approval store appends and reads artifacts in order.
- Rust tests prove invalid approval JSONL returns a typed JSON error.
- Structure verification requires SDD 0024, approval contracts, and approval tests.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove `ApprovalArtifact`, `ApprovalStatus`, `JsonlApprovalStore`, approval contracts, and approval tests. Existing dry-run, persistent evidence, and metadata preview paths remain valid.

## Observability And Performance Evidence

Record:

- failing test evidence before implementation.
- targeted Rust test result after implementation.
- strict quality gate result.
- confirmation that approval artifact creation does not grant local control.
