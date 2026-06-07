# SDD 0276 - Student App AI Tutor Question-Bank Draft Answer Feedback Archive Storage Commit

## Problem

SDD 0275 records a Student App AI Tutor feedback archive persistence command,
but it intentionally stops before durable Teaching Archive storage. The next
root workflow gap is committing that reviewed command through the existing
Teaching Archive use case boundary without allowing JavaScript to bypass the
service layer with raw SQL, HTTP, or model/tool side effects.

This slice advances the Student App AI Tutor answer feedback loop from
`PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED` to committed student archive
storage. It preserves the immutable root requirements around student app
learning support, own-student scope, archive access, AI tutor feedback, and
safe evidence while keeping row verification, real model scoring, public
release, and complete AI Tutor productization as later reviewed slices.

## Scope

Add an auditable feedback archive storage commit runtime for the Student App
question-bank draft answer feedback chain.

The runtime consumes:

- the READY 0275 feedback archive persistence command report;
- the recorded safe `STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND`;
- a storage commit policy that allows main database writes only through an
  injected Teaching Archive use case port;
- `TeachingArchiveCreateItemPort.createArchiveItem`;
- idempotency evidence for replay safety.

The runtime records
`STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMITTED`.

This is a committed Teaching Archive use case boundary, not a JS direct database write.

## Boundary

The runtime creates a `createTeachingArchiveItem` command with:

- `targetUseCase=CreateArchiveItem.ExecuteWithPersistence`;
- `targetRepository=ArchiveRepository.Create`;
- `targetTable=teaching_archive_items`;
- `ownerType=STUDENT`;
- `materialType=HOMEWORK`;
- `source=SYSTEM_IMPORT`;
- `analysisIntents=ARCHIVE_ONLY,TUTORING`;
- `contentRef=student-ai-tutor-feedback-archive:<commandId>:<sha256>`;
- service principal context scoped to `TEACHING_READ`,
  `STUDENT_ARCHIVE_WRITE`, and `STUDENT_ASSIGNED_READ`.

It preserves `scoreSummary`, safe `learnerFeedback`, approval evidence, source
delivery envelope IDs, submission ID, grading request ID, question-bank draft
ref, tutoring request ID, source archive item ID, and `student:` scope.

It blocks direct database access, HTTP execution, direct publication, model
inference, answer-key disclosure, worker metadata disclosure, raw model output,
result refs, remote device control, local tool mutation, and Swarm.

## Contracts

- Runtime:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-runtime.mjs`
- Runtime tests:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-runtime.test.mjs`
- Audit:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-audit.mjs`
- Audit tests:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-audit.test.mjs`
- Report:
  `reports/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit.current.json`
- Source evidence:
  `reports/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command.current.json`
- Go bridge:
  `services/teaching-archive-gateway/internal/usecase/create_archive_item_test.go`

The append-only commit log defaults to
`reports/student-command-log/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit.jsonl`.

## Acceptance Criteria

- Runtime tests pass and cover positive commit, idempotency, missing port,
  non-persisted result, invalid archive ID, unsafe feedback text, forbidden
  direct DB/HTTP/model/Swarm policies, student mismatch, and leaked fields.
- Audit tests pass and prove the 0275 source command is READY but not already
  committed.
- `npm run audit:student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit`
  reports `READY`.
- The Go bridge test
  `TestCreateArchiveItemAcceptsStudentAppAiTutorFeedbackArchiveStorageCommitCommandShape`
  proves `CreateArchiveItem.ExecuteWithPersistence` accepts the Student App AI
  Tutor feedback archive commit shape.
- `npm run audit:root-workflow-coverage` requires
  `studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveStorageCommit`.
- `npm run verify:structure` requires this SDD, runtime, runtime test, audit,
  and audit test.
- Strict quality includes
  `Student App AI Tutor question-bank draft answer feedback archive storage commit runtime audit`.
- The architecture board states 10.16/10 as committed Student App AI Tutor
  feedback archive storage evidence while real model scoring, row verification,
  complete AI Tutor productization, and public release remain separate slices.

## Performance

This slice does not rerun `production10k` because it adds a reviewed async
Student App archive commit boundary, not a new hot-path worker or database pool
configuration. Its probe budget is P99 <= 50ms. Current whole-system evidence
remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`.

For current performance assessment, the system is already in the high
concurrency business API/backend class under the measured workload, but it is
not comparable to pure gateways or in-memory systems such as Nginx, Envoy, or
Redis. The remaining gap to top-tier low-latency systems is not a single Go
endpoint; it is the full write path: durable PostgreSQL commit, audit evidence,
authorization, safety boundaries, queue/worker coordination, and future model
or retrieval calls.

## Rollback

Remove the 0276 runtime, tests, audit, audit tests, report, append-only commit
log output, Go bridge test, `package.json` audit script, strict quality hook,
root workflow coverage hook, structure verifier entries, SDD, and
architecture-board 10.16 text. Keep 0260-0275 intact because Student App AI
Tutor request, worker claim, result, question-bank visibility/content/read,
answer submission, scoring request/input/result, completion bridge, publication
precheck, reviewed feedback artifact, publication approval, delivery envelope,
and archive persistence command remain valid independent slices.
