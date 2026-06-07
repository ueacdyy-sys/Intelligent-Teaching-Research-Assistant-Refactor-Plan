# SDD 0277 - Student App AI Tutor Question-Bank Draft Answer Feedback Archive Row Verification

## Problem

SDD 0276 commits a reviewed Student App AI Tutor feedback archive command
through the injected Teaching Archive use case port and receives a persisted
archive item. That proves the controlled write boundary returned success, but
it does not yet prove the item can be read back as the expected physical
`teaching_archive_items` row.

This slice closes that evidence gap without changing the hot path or repeating
production10k benchmarks. It verifies the committed Student App AI Tutor
feedback archive item through an injected row-read port and Go repository
evidence. It is not a JS direct database read.

## Scope

Add a Student App AI Tutor feedback archive physical row verification runtime.

The runtime command port is
`StudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveRowVerificationPort.verifyTeachingArchivePhysicalRow`.

This slice:

- consumes only a READY 0276 feedback archive storage commit report;
- requires the 0276 result status
  `STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMITTED`;
- requires `TeachingArchiveRowReadPort.getArchiveItemById`;
- requires the read port result to identify `ArchiveRepository.GetByID` and
  `teaching_archive_items`;
- verifies that the physical row fields match the committed archive item
  exactly: id, owner type, student id, material type, title, source, content
  ref, tags, analysis intents, OCR status, and created at;
- records append-only row verification evidence for idempotent replay;
- preserves learner feedback, approval evidence, source storage commit
  evidence, and own-student scope;
- blocks direct database access, HTTP execution, model calls, answer-key
  disclosure, worker metadata, raw model output, result refs, local tool
  mutation, remote device control, and Swarm;
- records
  `STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PHYSICAL_ROW_VERIFIED`
  and sets `physicalDatabaseRowVerified=true`.

## Boundary

The runtime verifies the committed item shape:

- `ownerType=STUDENT`;
- `materialType=HOMEWORK`;
- `source=SYSTEM_IMPORT`;
- `contentRef=student-ai-tutor-feedback-archive:<commandId>:<sha256>`;
- `tags=student_app_ai_tutor,feedback,question_bank,archive_commit`;
- `analysisIntents=ARCHIVE_ONLY,TUTORING`;
- `ocrStatus=NOT_REQUIRED`.

The Go repository evidence is the adapter-side proof:
`ArchiveRepository.GetByID` selects from `teaching_archive_items` by `id = $1`
and scans the row through `scanArchiveItem`.

## Contracts

- Runtime:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-runtime.mjs`
- Runtime tests:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-runtime.test.mjs`
- Audit:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-audit.mjs`
- Audit tests:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-audit.test.mjs`
- Report:
  `reports/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification.current.json`
- Source evidence:
  `reports/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit.current.json`
- Teaching Archive Go repository evidence:
  `services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_items.go`
  and
  `services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_items_get_by_id_test.go`

The append-only verification log defaults to
`reports/student-command-log/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification.jsonl`.

## Acceptance Criteria

- Runtime tests pass and cover positive row verification, idempotency, missing
  port, missing row, mismatched row, wrong owner scope, forbidden
  DB/HTTP/model/Swarm policies, and leaked fields.
- Audit tests pass and prove the 0276 source storage commit is READY and
  committed.
- `npm run audit:student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification`
  reports `READY`.
- The Go repository test
  `TestGetByIDReturnsStudentAppAiTutorFeedbackArchiveStorageCommitPhysicalRow`
  proves `ArchiveRepository.GetByID` can read back the Student App AI Tutor
  feedback archive committed shape from `teaching_archive_items`.
- `npm run audit:root-workflow-coverage` requires
  `studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveRowVerification`.
- `npm run verify:structure` requires this SDD, runtime, runtime test, audit,
  and audit test.
- Strict quality includes
  `Student App AI Tutor question-bank draft answer feedback archive row verification runtime audit`.
- The architecture board states 10.17/10 as Student App AI Tutor feedback
  archive physical row verification evidence with
  `STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PHYSICAL_ROW_VERIFIED`
  while real model scoring, question generation, complete AI Tutor
  productization, and public release remain separate slices.

## Performance

This slice does not rerun `production10k` because it adds a reviewed Student
App archive evidence check, not a new hot-path worker, pool size, or database
configuration. Its probe budget is P99 <= 50ms. Current whole-system evidence
remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`.

The system is currently comparable to a high-concurrency internal business API
or SaaS backend under the measured mixed workload. It is not comparable to
pure in-memory caches or edge gateways. The remaining gap to top-tier
sub-10ms systems is the full durable business path: PostgreSQL commit/read,
authorization, audit evidence, safety boundaries, queue/worker coordination,
and future model or retrieval calls.

## Rollback

Remove the 0277 runtime, tests, audit, audit tests, report, verification log
output, Go repository row-read evidence test, `package.json` audit script,
strict quality hook, root workflow coverage hook, structure verifier entries,
SDD, and architecture-board 10.17 text. Keep 0260-0276 intact because Student
App AI Tutor request, worker claim, result, question-bank visibility/content,
answer submission, scoring request/input/result, completion bridge,
publication precheck, reviewed feedback artifact, publication approval,
delivery envelope, archive persistence command, and archive storage commit
remain valid independent slices.
