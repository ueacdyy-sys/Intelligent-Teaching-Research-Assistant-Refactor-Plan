# SDD 0303: Teaching Archive Material Draft Storage Precommit

## Problem

The immutable root requirements require archive materials, student archives, teaching materials, and personalized tutoring to become a real teaching workflow. SDD 0302 records teacher/admin human review for an Agent-generated archive material draft, but the system still needs a separate precommit boundary before final storage. Without that boundary, human approval could be accidentally collapsed into a direct database write, OCR/RAG job, or AI-grading side effect.

## Scope

Add `TeachingArchiveMaterialDraftStoragePrecommitPort.prepareArchiveMaterialDraftStorageCommand` as the next Teaching Archive controlled-write slice.

The runtime consumes the READY `TeachingArchiveMaterialDraftReviewPort.recordArchiveMaterialDraftHumanReview` report, verifies that review status is `TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_APPROVED_FOR_PRECOMMIT`, validates the target owner/material/security policy, and prepares an idempotent `CreateArchiveItem.ExecuteWithPersistence` command for a future final commit slice. It does not execute HTTP, does not directly access PostgreSQL, does not create the final archive row, does not start OCR/RAG, does not write AI grading state, and does not enable Swarm.

## Contracts

- Source report must be `TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW` with `TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_APPROVED_FOR_PRECOMMIT`.
- Source review boundary must keep `finalArchiveItemWriteStarted=false`, `mainDatabaseWriteStarted=false`, `ocrOrRagJobWriteStarted=false`, and `aiGradingWriteStarted=false`.
- Storage principal must be teacher/admin with `TEACHING_WRITE`, `STUDENT_ARCHIVE_WRITE`, and `HARNESS_APPROVE` or `ADMIN_SYSTEM`.
- Student archive precommit must have assigned or all-student access for the target student.
- Prepared command must target `createTeachingArchiveItem`, `CreateArchiveItem.ExecuteWithPersistence`, `ArchiveRepository.Create`, and `teaching_archive_items`.
- Precommit only allows `ARCHIVE_ONLY`; OCR/RAG and AI grading remain future explicit work.
- Runtime boundary keeps `mainDatabaseWritePrepared=true`, `mainDatabaseWriteStarted=false`, `mainDatabaseWriteCommitted=false`, `ocrOrRagJobWriteStarted=false`, `aiGradingWriteStarted=false`, `executeHttpRequestAllowed=false`, `directDatabaseAccessAllowed=false`, and `swarmAllowed=false`.

## Acceptance Criteria

- Runtime tests cover approved precommit, idempotent replay, idempotency conflict, unapproved review, source mismatch, unsafe principal, student scope mismatch, unsafe policy, forbidden analysis intent, missing port, leaked fields, unsafe content ref, and unsafe port result.
- Audit verifies source human-review readiness, runtime identity, safety boundaries, one-port probe, tests, existing Teaching Archive storage path, quality gate, root workflow coverage, structure verifier, SDD, and architecture board hooks.
- Root workflow coverage includes this slice in the Teaching Archive workflow and controlled Agent write workflow.
- Quality gate includes the new audit before root workflow coverage.
- Architecture board states 10.45/10 as storage-precommit evidence, not final material storage or a new performance benchmark.

## Performance Note

This slice is an in-process storage-precommit probe. It is intentionally not a new production10k benchmark. Current whole-system performance evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`; this slice advances the durable teaching-material workflow while preserving safety boundaries.

## Rollback

Remove the runtime, tests, audit, report registration, quality-gate entry, root workflow hook, structure-verifier entry, and architecture-board note. Existing append-only precommit logs are non-executing evidence and can be ignored by future final commit replay.
