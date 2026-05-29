# SDD 0027: Agent Harness Approval Queue Reader

## Problem

Agent Harness can persist approval artifacts and approval decisions as separate JSONL streams, and it can correlate in-memory records. The next safety step is a typed reader that loads both streams together and produces a single review snapshot.

Without this reader, later code could read only decisions, skip source artifact correlation, or accidentally treat a matched approval as execution input. The approval queue snapshot must prove the review state while keeping execution candidates disabled.

## Source Requirement References

- Root requirement: mobile social commands can ask the desktop assistant to control local applications.
- Root requirement: local application control must be routed through the coordinating assistant.
- SDD 0024: approval-required Harness decisions become pending approval artifacts.
- SDD 0025: approval decisions are durable review records with `executionReady=false`.
- SDD 0026: approval decisions must correlate to exactly one pending source artifact.
- Roadmap P5: Agent Harness requires permission, evidence, approval, and rollback model before real control.

## Scope

In scope:

- Add an approval queue snapshot JSON contract.
- Add a Rust JSONL approval queue reader.
- Load persisted approval artifacts and approval decisions together.
- Run approval decision correlation as part of the read path.
- Count uncorrelated decisions in the snapshot.
- Keep `executionCandidateCount=0`.
- Return typed JSON/IO errors from either JSONL stream.
- Prove uncorrelated decisions do not produce execution candidates.

Out of scope:

- Real local action execution.
- Returning executable commands.
- Marking approvals as consumed.
- Updating approval or decision JSONL records.
- Database-backed queues.
- Human approval UI.
- Signature, encryption, retention, or pruning.

## Contracts

New contracts:

- `contracts/harness/approval-queue-snapshot.schema.json`
- `contracts/harness/approval-queue-snapshot.example.json`

Rust API:

- `ApprovalQueueSnapshot`
- `JsonlApprovalQueueReader`

## Acceptance Criteria

- Rust tests prove the reader loads persisted approval artifacts and decisions together.
- Rust tests prove the reader runs correlation and reports a matched decision.
- Rust tests prove uncorrelated decisions are counted and still produce no execution candidates.
- Rust tests prove invalid approval artifact JSONL returns a typed JSON error.
- Rust tests prove invalid approval decision JSONL returns a typed JSON error.
- Rust tests prove queue snapshots serialize to the contract shape.
- Structure verification requires SDD 0027, queue snapshot contracts, reader module, and reader tests.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove `ApprovalQueueSnapshot`, `JsonlApprovalQueueReader`, approval queue snapshot contracts, reader tests, SDD 0027 structure checks, and README references. Existing approval artifacts, approval decisions, and correlation reports remain valid.

## Observability And Performance Evidence

Record:

- failing test evidence before implementation.
- targeted Rust test result after implementation.
- strict quality gate result.
- confirmation that queue snapshots do not execute local actions or expose execution candidates.
