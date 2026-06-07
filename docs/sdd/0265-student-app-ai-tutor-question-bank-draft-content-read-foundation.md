# SDD 0265 - Student App AI Tutor Question-Bank Draft Content Read Foundation

## Problem

SDD 0264 intentionally blocked question-bank draft content reads because the
system only had `questionBankDraftRef` metadata. That was a correct safety
boundary, but it left the Student App unable to open the generated practice
questions behind a visible draft.

This slice adds the first real content-store/read foundation for Student App AI
Tutor question-bank drafts. It is still not a generation, answering, scoring, or
publication slice.

## Scope

Add a storage-backed, own-student read path for draft question-bank content:

- domain model: `QuestionBankDraftContent` and `QuestionBankDraftItem`
- use case: `ReadStudentAppQuestionBankDraftContent.Execute`
- repository: `ArchiveRepository.SaveQuestionBankDraftContent`
- repository read: `ArchiveRepository.GetQuestionBankDraftContentForStudent`
- PostgreSQL table: `teaching_question_bank_draft_contents`
- HTTP endpoint: `GET /v1/student-app/question-bank-draft-content`
- OpenAPI path:
  `contracts/openapi/teaching-archive.student-app-question-bank-draft-content.path.yaml`
- SQL contract: `contracts/sql/teaching-archive.sql`

The read path must require `STUDENT + STUDENT_APP + STUDENT_OWN_READ + OWN`,
must normalize `local://question-bank-drafts/tutor_req_*.json`, and must read by
both `question_bank_draft_ref` and `student_id`.

## Contracts

- Domain:
  `services/teaching-archive-gateway/internal/domain/question_bank_draft_content.go`
- Use case:
  `services/teaching-archive-gateway/internal/usecase/read_student_app_question_bank_draft_content.go`
- PostgreSQL adapter:
  `services/teaching-archive-gateway/internal/adapter/postgres/repository_question_bank_draft_content.go`
- HTTP adapter:
  `services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_draft_content.go`
- Audit:
  `tools/student-app-ai-tutor-question-bank-draft-content-read-audit.mjs`
- Report:
  `reports/student-app-ai-tutor-question-bank-draft-content-read.current.json`

## Acceptance Criteria

- Domain tests cover normalization, linked request/ref validation, duplicate
  item rejection, size limits, and cross-student rejection.
- Use case tests prove forbidden principals do not hit the repository, missing
  content returns `ErrNotFound`, and repository leaks are rejected.
- PostgreSQL tests prove the table exists, JSONB items are written, upsert is
  supported, and reads use `question_bank_draft_ref = $1 AND student_id = $2`.
- HTTP tests prove the Student App can read own question prompts, cross-student
  content is not found, unsupported methods are rejected, and the response omits
  student ids, worker lease fields, scores, publication fields, expected
  answers, and explanations.
- Strict quality includes the content read foundation audit.
- Root workflow coverage requires
  `studentAppAiTutorQuestionBankDraftContentRead`.
- The architecture board marks 10.5/10 as a content-store/read foundation, not
  a full AI Tutor completion claim.

## Rollback

Remove the content read domain, use case, PostgreSQL repository, table/index
SQL, HTTP endpoint, OpenAPI path, audit/report, root coverage hook, quality hook,
structure verifier entries, and architecture board 10.5 text. Keep SDD 0264 and
its safe `BLOCK_UNTIL_CONTENT_STORE` precheck as a conservative fallback for
clients that have not adopted the storage-backed read path.
