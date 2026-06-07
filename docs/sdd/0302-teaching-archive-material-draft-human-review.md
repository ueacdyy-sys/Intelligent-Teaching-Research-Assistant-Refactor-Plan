# SDD 0302: Teaching Archive Material Draft Human Review

## Problem

The immutable root requirements keep teaching materials, archive materials, and student archives as core teaching surfaces. SDD 0227 lets an Agent submit an archive material draft intent, but review-only intent is still not enough to move toward durable storage. The system needs a separate human-review gate so an Agent draft can be approved for a future storage precommit without creating final archive rows, OCR/RAG jobs, or grading state.

## Scope

Add `TeachingArchiveMaterialDraftReviewPort.recordArchiveMaterialDraftHumanReview` as the next Teaching Archive controlled-write slice.

The runtime consumes the READY `TeachingDraftCommandPort.submitArchiveMaterialDraftIntent` report, records teacher/admin human review evidence through an injected review port, and produces append-only approval or revision-required evidence. It does not create final `ArchiveItem` records, does not write the main database, does not start OCR/RAG work, does not write AI grading state, and does not expose execution candidates.

## Contracts

- Source report must be `TEACHING_ARCHIVE_MATERIAL_DRAFT_INTENT_RUNTIME` with `REVIEW_REQUIRED`.
- Reviewer must be `TEACHER` or `ADMIN` with `TEACHING_WRITE` plus `HARNESS_APPROVE` or `ADMIN_SYSTEM`.
- Review input must include target owner, material type, source refs, draft artifact ref, checklist, comments, review policy, evidence refs, and idempotency key.
- Approved review emits `TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_APPROVED_FOR_PRECOMMIT`.
- Revision review emits `TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_REVISION_REQUIRED`.
- Runtime boundary keeps `finalArchiveItemWriteStarted=false`, `mainDatabaseWriteStarted=false`, `ocrOrRagJobWriteStarted=false`, `aiGradingWriteStarted=false`, `executeHttpRequestAllowed=false`, and `swarmAllowed=false`.

## Acceptance Criteria

- Runtime tests cover approval, revision-required review, idempotent replay, idempotency conflict, missing port, unsafe reviewer, unsafe source report, unsafe policy, leaked fields, missing checklist, missing source evidence, and unsafe port result.
- Audit verifies source report readiness, runtime identity, safety boundaries, one-port probe, tests, quality gate, root workflow coverage, structure verifier, SDD, and architecture board hooks.
- Root workflow coverage includes this slice in the Teaching Archive workflow and Agent Harness controlled-write workflow.
- Quality gate includes the new audit before root workflow coverage.
- Architecture board states 10.42/10 as a teaching-material review gate, not product completion or a new performance claim.

## Performance Note

This slice is an in-process review-boundary probe. It is intentionally not a new production10k benchmark. Current whole-system performance evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`; this slice adds governance coverage and a small P99 check only.

## Rollback

Remove the runtime, tests, audit, report registration, quality-gate entry, root workflow hook, structure-verifier entry, and architecture-board note. Existing append-only review logs are non-executing evidence and can be left unread by future storage-precommit replay.
