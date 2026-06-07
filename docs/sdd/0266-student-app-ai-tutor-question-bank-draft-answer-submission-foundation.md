# SDD 0266 - Student App AI Tutor Question-Bank Draft Answer Submission Foundation

## Problem

SDD 0265 lets the Student App safely open its own question-bank draft prompts,
but the system still cannot accept a student's answers for those prompts. That
blocks the next real AI Tutor loop step: collecting a student's attempt before
any scoring, feedback, or student-visible learning result can be produced.

## Scope

Add a storage-backed, own-student answer submission path for question-bank draft
content:

- domain model: `QuestionBankDraftAnswerSubmission`
- use case: `SubmitStudentAppQuestionBankDraftAnswer.ExecuteWithPersistence`
- repository write: `ArchiveRepository.SubmitQuestionBankDraftAnswerSubmission`
- PostgreSQL table: `teaching_question_bank_draft_answer_submissions`
- HTTP endpoint:
  `POST /v1/student-app/question-bank-draft-answer-submissions`
- OpenAPI path:
  `contracts/openapi/teaching-archive.student-app-question-bank-draft-answer-submissions.path.yaml`
- SQL contract: `contracts/sql/teaching-archive.sql`

The submission path must require `STUDENT + STUDENT_APP + STUDENT_OWN_READ +
STUDENT_OWN_WRITE + OWN`, must read draft content by both
`question_bank_draft_ref` and `student_id`, and must reject duplicate or unknown
`itemId` values before persistence.

This slice does not score answers, expose expected answers, expose
explanations, generate new questions, publish student-visible learning results,
or run model inference.

## Contracts

- Domain:
  `services/teaching-archive-gateway/internal/domain/question_bank_draft_answer_submission.go`
- Use case:
  `services/teaching-archive-gateway/internal/usecase/submit_student_app_question_bank_draft_answer.go`
- PostgreSQL adapter:
  `services/teaching-archive-gateway/internal/adapter/postgres/repository_question_bank_draft_answer_submission.go`
- HTTP adapter:
  `services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_draft_answer_submission.go`
- Audit:
  `tools/student-app-ai-tutor-question-bank-draft-answer-submission-audit.mjs`
- Report:
  `reports/student-app-ai-tutor-question-bank-draft-answer-submission.current.json`

## Acceptance Criteria

- Domain tests cover own-student normalization, unsafe principal rejection,
  duplicate answer rejection, answer size limits, unknown item rejection, and
  submitted metadata creation.
- Use case tests prove forbidden principals do not hit the repository, missing
  scoped draft content returns `ErrNotFound`, unknown items are rejected before
  persistence, and successful submissions persist exactly once.
- PostgreSQL tests prove the answer submission table exists, `answers` is JSONB,
  SQL uses parameterized insert arguments, and timing records DB insert latency.
- HTTP tests prove the Student App can submit answers for its own draft, cross
  student draft submissions are not found, unknown items are rejected, unsupported
  methods are rejected, and the response omits answer text, expected answers,
  explanations, and score fields.
- Strict quality includes the answer submission foundation audit.
- Root workflow coverage requires
  `studentAppAiTutorQuestionBankDraftAnswerSubmission`.
- The architecture board marks 10.6/10 as an answer submission foundation, not a
  full AI Tutor completion claim.

## Rollback

Remove the answer submission domain, use case, PostgreSQL repository, table and
index SQL, HTTP endpoint, OpenAPI path, audit/report, root coverage hook, quality
hook, structure verifier entries, and architecture board 10.6 text. Keep SDD
0265 as the conservative content read foundation.
