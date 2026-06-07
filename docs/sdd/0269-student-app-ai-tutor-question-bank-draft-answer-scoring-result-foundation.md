# SDD 0269 - Student App AI Tutor Question-Bank Draft Answer Scoring Result Foundation

## Problem

SDD 0267 can queue a student's question-bank draft answer for AI grading, and
SDD 0268 lets an internal worker read the protected scoring input. Students
still need a safe read path to check whether their submitted answer has been
graded and, when complete, see only the allowed summary.

Without this slice, Student App clients would either poll a worker/internal
endpoint or use a broad AI grading response that can expose answer text,
expected answers, explanations, result refs, worker ids, claim leases, or
internal error messages.

## Scope

Add a Student App read-only scoring result foundation:

- domain input:
  `ReadStudentAppQuestionBankDraftAnswerScoringResultInput`
- domain builder:
  `BuildStudentAppQuestionBankDraftAnswerScoringResult`
- use case:
  `ReadStudentAppQuestionBankDraftAnswerScoringResult.Execute`
- repository reads:
  `GetQuestionBankDraftAnswerSubmissionForStudent` and
  `GetLatestQuestionBankDraftAnswerScoringRequestForStudent`
- HTTP endpoint:
  `GET /v1/student-app/question-bank-draft-answer-submissions/{submissionId}/ai-grading-result`
- OpenAPI path:
  `contracts/openapi/teaching-archive.student-app-question-bank-draft-answer-submission-ai-grading-result.path.yaml`

The endpoint must require `STUDENT + STUDENT_APP + STUDENT_OWN_READ + OWN`.
Repository lookup must be scoped by `submissionId + studentId`. The response is
limited to:

- `submissionId`
- `requestId`
- `questionBankDraftRef`
- `tutoringAnalysisRequestId`
- `archiveItemId`
- `status`
- `scoreSummary` only when `SUCCEEDED`
- `errorCode` only when `FAILED`
- `requestedAt`, `completedAt`, and `updatedAt`

This slice does not run model inference, compute scores, persist grading
results, generate detailed feedback, publish student-visible feedback, or expose
answer keys.

## Contracts

- Domain:
  `services/teaching-archive-gateway/internal/domain/question_bank_draft_answer_scoring_result.go`
- Use case:
  `services/teaching-archive-gateway/internal/usecase/read_student_app_question_bank_draft_answer_scoring_result.go`
- HTTP adapter:
  `services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_draft_answer_submission.go`
- PostgreSQL query:
  `services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_grading_query.go`
- SQL contract:
  `contracts/sql/teaching-archive.sql`
- OpenAPI path:
  `contracts/openapi/teaching-archive.student-app-question-bank-draft-answer-submission-ai-grading-result.path.yaml`
- Audit:
  `tools/student-app-ai-tutor-question-bank-draft-answer-scoring-result-audit.mjs`
- Report:
  `reports/student-app-ai-tutor-question-bank-draft-answer-scoring-result.current.json`

## Acceptance Criteria

- Domain tests prove non-student-app principals are rejected, pending/failed
  internals are hidden, broken request linkage is rejected, and successful
  results expose only `scoreSummary`.
- Use case tests prove forbidden principals do not hit repositories, missing
  submissions or requests return `ErrNotFound`, and lookups use both
  `submissionId` and `studentId`.
- PostgreSQL tests prove the latest scoring request is queried by
  `source_question_bank_answer_submission_id + source_archive_student_id`, and
  schema includes a partial lookup index for that path.
- HTTP tests prove the Student App endpoint returns safe metadata, rejects
  teacher/remote/cross-student principals, rejects unsupported methods, and
  does not leak answer text, expected answers, explanations, result refs,
  worker ids, claim leases, or internal error messages.
- OpenAPI documents the Student App GET endpoint and limits the response schema
  to student-safe fields.
- Strict quality includes the scoring result foundation audit.
- Root workflow coverage requires
  `studentAppAiTutorQuestionBankDraftAnswerScoringResult`.
- The architecture board marks 10.9/10 as a safe student-visible scoring-result
  read foundation, not a completed AI Tutor or real model grading product.

## Rollback

Remove the scoring result domain, use case, repository method, HTTP subresource,
OpenAPI path, SQL/index changes, audit/report, root coverage hook, quality hook,
structure verifier entries, and architecture board 10.9 text. Keep SDD 0267 and
SDD 0268 as the queued scoring request and worker-only input foundations.
