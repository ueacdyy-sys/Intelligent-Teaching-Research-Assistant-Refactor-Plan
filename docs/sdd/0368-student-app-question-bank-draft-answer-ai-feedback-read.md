# SDD 0368: Student App Question-Bank Draft Answer AI Feedback Read

## Problem

The Student App question-bank draft answer flow already has safe submission
metadata, AI grading result metadata, reviewed feedback artifact evidence, and
feedback archive row verification evidence. The missing product surface is a
student-facing read path for the reviewed and archived learner feedback.

Without this slice, the system can prove feedback was archived but the Student
App still cannot read a safe feedback card by `submissionId`.

## Scope

Add `GET /v1/student-app/question-bank-draft-answer-submissions/{submissionId}/ai-feedback`.

The read path:

- authorizes only Student App own-student reads before repository access;
- reads the student's own `QuestionBankDraftAnswerSubmission`;
- reads the latest safe feedback archive snapshot for that submission;
- validates the physical feedback archive row through `ArchiveRepository.GetByID`;
- returns only reviewed learner feedback, score summary, lineage identifiers,
  archive metadata, and timestamps needed by the Student App UI.

This slice does not generate feedback, call a model, run OCR/RAG, start Swarm,
write the database, or expose raw grading/model artifacts.

## Contracts

- OpenAPI path:
  `contracts/openapi/teaching-archive.student-app-question-bank-draft-answer-submission-ai-feedback.path.yaml`
- Domain:
  `services/teaching-archive-gateway/internal/domain/question_bank_draft_answer_feedback_read.go`
- Use case:
  `services/teaching-archive-gateway/internal/usecase/read_student_app_question_bank_draft_answer_feedback.go`
- PostgreSQL read projection:
  `services/teaching-archive-gateway/internal/adapter/postgres/repository_question_bank_draft_answer_feedback_archive_snapshot.go`
- HTTP adapter:
  `services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_draft_answer_submission.go`

## Safety Boundary

The response must not expose:

- answer text, expected answers, answer keys, explanations, or submitted answer
  payloads;
- `contentRef`, `resultRef`, raw model output, prompts, worker ids, claim
  metadata, internal errors, SQL rows, or database implementation details;
- model, OCR, RAG, tool, Swarm, or background worker state.

The physical feedback archive row must remain:

- `ownerType=STUDENT`;
- `materialType=HOMEWORK`;
- `source=SYSTEM_IMPORT`;
- `ocrStatus=NOT_REQUIRED`;
- tags include `student_app_ai_tutor`, `feedback`, `question_bank`,
  `archive_commit`;
- analysis intents include `ARCHIVE_ONLY` and `TUTORING`;
- `contentRef` uses the reviewed feedback archive prefix.

## Acceptance Criteria

- Domain tests cover Student App own-student scoping, non-student rejection,
  safe card building, broken lineage rejection, wrong archive row shape, and
  unsafe feedback text.
- Use-case tests prove forbidden principals are rejected before repository
  access and the read path resolves submission, safe snapshot, and archive row
  in order.
- HTTP tests prove `GET .../ai-feedback` returns a safe feedback card and
  rejects teacher, cross-student, remote, and unsupported method access.
- PostgreSQL tests prove schema creation, safe projection SELECT fields,
  scoped lookup arguments, latest ordering, and no sensitive column leakage.
- Structure verification tracks this SDD, OpenAPI path, and Go files.

## Performance Note

This is a product read-path closure slice. It adds one scoped submission read,
one latest safe feedback projection read, and one archive-row shape validation
read. It does not change worker count, DB pool sizing, PgBouncer configuration,
write batching, or the production mixed workload.

Current whole-system performance evidence remains:
`22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`. No new `production10k`
run is required until a runtime/configuration change targets the measured hot
path again.

## Rollback

Remove the 0368 OpenAPI path, domain/usecase/postgres/http additions and tests,
the structure verifier entries, the root requirements trace row, and the
architecture-board 12.40 note. Keep 0266-0301 and 0366-0367 intact because
answer submission, grading, feedback archive evidence, and summary fast-path
gates remain valid independent slices.
