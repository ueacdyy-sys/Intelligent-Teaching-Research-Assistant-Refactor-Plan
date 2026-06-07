# SDD 0285 - Student App AI Tutor Question-Bank Draft Generation Content Storage Commit

## Problem

SDD 0284 records a teacher/admin review for generated question-bank draft
content, but it intentionally stops before `teaching_question_bank_draft_contents`
storage. The Student App AI Tutor flow still has a product gap: reviewed
question content cannot be used by later student read, answer submission, or
scoring slices until the reviewed content is committed through the Teaching
Archive storage boundary.

This slice closes that gap without letting JavaScript bypass the Go service
layer with raw SQL, HTTP, publication, answering, scoring, model inference, or
tool side effects.

## Scope

Add a Student App AI Tutor question-bank draft generation content storage
commit runtime.

The runtime command port is
`StudentAppAITutorQuestionBankDraftGenerationContentStorageCommitPort.saveReviewedQuestionBankDraftContent`.

This slice:

- consumes READY 0284 teacher-review evidence;
- requires `TEACHER_REVIEW_RECORDED_NOT_STORED` and
  `APPROVED_FOR_CONTENT_STORAGE_NOT_COMMITTED`;
- consumes the linked 0281 input envelope, 0278 generation plan, and 0260
  source request evidence;
- requires the same `questionBankDraftRef`, `studentId`, tutoring request ID,
  archive item ID, source archive material, and target content table;
- requires a SERVICE principal with `TEACHING_WRITE`,
  `STUDENT_ARCHIVE_WRITE`, and `QUESTION_BANK_DRAFT_STORAGE_COMMIT`;
- maps teacher-reviewed question text, teacher-authored rubric, teacher scoring
  explanation, and learning target into a `QuestionBankDraftContent` command;
- commits only through the injected Teaching Archive content storage port;
- targets `ArchiveRepository.SaveQuestionBankDraftContent`;
- targets `teaching_question_bank_draft_contents`;
- records
  `STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMITTED`;
- allows `questionBankContentWriteStarted=true`,
  `questionBankContentWriteCommitted=true`, and `contentStored=true`;
- preserves a safe student preview with question text and learning target only.

This is not a physical row verification runtime, not a student-visible
publication runtime, not an answer submission runtime, not a scoring runtime,
and not a model execution runtime.

## Contracts

- Runtime:
  `tools/student-app-ai-tutor-question-bank-draft-generation-content-storage-commit-runtime.mjs`
- Runtime tests:
  `tools/student-app-ai-tutor-question-bank-draft-generation-content-storage-commit-runtime.test.mjs`
- Audit:
  `tools/student-app-ai-tutor-question-bank-draft-generation-content-storage-commit-audit.mjs`
- Audit tests:
  `tools/student-app-ai-tutor-question-bank-draft-generation-content-storage-commit-audit.test.mjs`
- Report:
  `reports/student-app-ai-tutor-question-bank-draft-generation-content-storage-commit.current.json`
- Source teacher review:
  `reports/student-app-ai-tutor-question-bank-draft-generation-teacher-review.current.json`
- Source input envelope:
  `reports/student-app-ai-tutor-question-bank-draft-generation-input-envelope.current.json`
- Source generation plan:
  `reports/student-app-ai-tutor-question-bank-draft-generation-plan.current.json`
- Source AI Tutor request:
  `reports/student-app-ai-tutor-request.current.json`
- Go repository:
  `services/teaching-archive-gateway/internal/adapter/postgres/repository_question_bank_draft_content.go`
- Go domain:
  `services/teaching-archive-gateway/internal/domain/question_bank_draft_content.go`
- SQL table:
  `contracts/sql/teaching-archive.sql`

The append-only commit log defaults to
`reports/student-command-log/student-app-ai-tutor-question-bank-draft-generation-content-storage-commit.jsonl`.

## Acceptance Criteria

- Runtime tests pass and cover positive storage commit, idempotent replay,
  conflicting replay, missing port, unsafe service principal, unsafe source
  state, unsafe policy, leaked model fields, mismatched input-envelope linkage,
  unsafe text, unsafe port result, missing teacher review evidence, and future
  gates for row verification, student read verification, answering, scoring,
  and publication.
- Audit tests pass and prove 0284 teacher review is READY but not previously
  stored.
- Audit tests prove the 0281 input envelope, 0278 generation plan, and 0260
  source request point to the same Student App AI Tutor draft.
- Audit tests prove the Go repository/table can store internal
  `ExpectedAnswer` and `Explanation`, while the student content presenter does
  not expose those fields.
- `npm run audit:student-app-ai-tutor-question-bank-draft-generation-content-storage-commit`
  reports `READY`.
- `npm run audit:root-workflow-coverage` requires
  `studentAppAiTutorQuestionBankDraftGenerationContentStorageCommit`.
- `npm run verify:structure` requires this SDD, runtime, runtime test, audit,
  and audit test.
- Strict quality includes
  `Student App AI Tutor question-bank draft generation content storage commit runtime audit`.
- The architecture board states 10.25/10 as
  `STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMITTED`
  evidence while physical row verification, student read verification,
  answering, scoring, student-visible publication, complete AI Tutor
  productization, and public release remain future reviewed slices.

## Performance

This slice does not rerun `production10k` because it adds a reviewed content
storage command boundary and no new worker-count, database pool, Docker,
PgBouncer, or hot-path benchmark configuration. Its local probe budget is
P99 <= 50ms.

Current whole-system evidence remains `22,435.1 read/write RPS`,
`P99 44.44ms`, `0 errors`. That evidence supports the 50ms production target
for the measured durable mixed workload. It does not prove a sub-10ms
production standard, and it does not include future model inference, RAG, OCR,
or full live question answering.

## Rollback

Remove the 0285 runtime, tests, audit, audit tests, report, append-only commit
log output, `package.json` audit script, strict quality hook, root workflow
coverage hook, structure verifier entries, SDD, and architecture-board 10.25
text. Keep 0260-0284 intact because request, worker claim, result, generation
plan, worker precheck, worker claim, input envelope, model execution precheck,
controlled draft, and teacher review remain valid independent evidence.
