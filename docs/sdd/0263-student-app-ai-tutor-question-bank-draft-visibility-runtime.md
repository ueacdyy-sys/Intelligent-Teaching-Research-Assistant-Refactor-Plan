# SDD 0263 - Student App AI Tutor Question-Bank Draft Visibility Runtime

## Problem

SDD 0260 admits a Student App AI Tutor request, SDD 0261 lets a local
`StudentTutorAgent` worker claim it, and SDD 0262 records the controlled worker
result. When that result includes a `questionBankDraftRef`, the Student App
still needs a reviewed entry point to list the student's own personalized
question-bank draft metadata without exposing draft content or starting a new
generation flow.

This slice adds that visibility boundary. It is not a question generation runtime,
not a draft content retrieval runtime, not an answering or scoring
runtime, and not a student-visible publication runtime.

## Scope

Add a `Student App AI Tutor question-bank draft visibility runtime`.

The read port is
`StudentAppAITutorQuestionBankDraftVisibilityPort.listStudentAppQuestionBankDrafts`.

This slice:

- requires a `USER` principal with `STUDENT` role and `STUDENT_APP` entry point
- requires `STUDENT_OWN_READ`
- requires `studentAccess.mode=OWN` and an own student id
- supports bounded `pageSize` and optional cursor
- calls only the injected use-case port backed by
  `ListStudentAppQuestionBankDrafts.Execute`
- requires Go domain evidence for
  `NormalizeListStudentAppQuestionBankDraftsInput`,
  `AuthorizeListStudentAppQuestionBankDrafts`,
  `BuildStudentAppQuestionBankDraftPage`, and
  `NewStudentAppQuestionBankDraft`
- requires Go repository evidence for
  `ArchiveRepository.ListTutoringAnalysisRequests` with `status =`,
  `source_archive_student_id =`, and `question_bank_draft_ref IS NOT NULL`
- requires OpenAPI evidence for `operationId: listStudentAppQuestionBankDrafts`
- returns only metadata: request id, archive item id, source material,
  result summary, result ref, draft ref, and timestamps
- rejects student id, worker lease fields, draft content, questions, answers,
  scores, and publication fields from the port result
- records an idempotent append-only visibility record
- returns `STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_LISTED`
- blocks draft content reads, question generation, student answering, scoring,
  student-visible publication, direct database access, HTTP execution, local
  tool mutation, remote device control, and Swarm
- keeps the control-plane visibility path inside a 50ms target

## Contracts

- Input schema:
  `contracts/agent/student-app-ai-tutor-question-bank-draft-visibility.input.schema.json`
- Output schema:
  `contracts/agent/student-app-ai-tutor-question-bank-draft-visibility.output.schema.json`
- Examples:
  `contracts/agent/student-app-ai-tutor-question-bank-draft-visibility.input.example.json`
  and
  `contracts/agent/student-app-ai-tutor-question-bank-draft-visibility.output.example.json`
- Runtime:
  `tools/student-app-ai-tutor-question-bank-draft-visibility-runtime.mjs`
- Runtime tests:
  `tools/student-app-ai-tutor-question-bank-draft-visibility-runtime.test.mjs`
- Audit:
  `tools/student-app-ai-tutor-question-bank-draft-visibility-audit.mjs`
- Audit tests:
  `tools/student-app-ai-tutor-question-bank-draft-visibility-audit.test.mjs`
- Go use case evidence:
  `services/teaching-archive-gateway/internal/usecase/list_student_app_question_bank_drafts.go`
  and
  `services/teaching-archive-gateway/internal/usecase/list_student_app_question_bank_drafts_test.go`
- Go domain evidence:
  `services/teaching-archive-gateway/internal/domain/student_app_question_bank_drafts.go`
  and
  `services/teaching-archive-gateway/internal/domain/student_app_question_bank_drafts_test.go`
- Go repository evidence:
  `services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis.go`
- HTTP/OpenAPI evidence:
  `services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_drafts.go`,
  `services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_drafts_test.go`,
  and
  `contracts/openapi/teaching-archive.student-app-question-bank-drafts.path.yaml`
- Root workflow coverage:
  `tools/root-workflow-coverage-audit.mjs`
- Strict quality gate:
  `tools/quality-gate.mjs`

The append-only visibility log defaults to
`reports/student-command-log/student-app-ai-tutor-question-bank-draft-visibility.jsonl`.

## Acceptance Criteria

- `node --test tools/student-app-ai-tutor-question-bank-draft-visibility-runtime.test.mjs` passes.
- `node --test tools/student-app-ai-tutor-question-bank-draft-visibility-audit.test.mjs` passes.
- `npm run audit:student-app-ai-tutor-question-bank-draft-visibility` reports `READY`.
- `npm run audit:root-workflow-coverage` reports `READY` and requires
  `studentAppAiTutorQuestionBankDraftVisibility`.
- `npm run verify:structure` requires this SDD, schemas, examples, runtime,
  runtime test, audit, and audit test.
- Strict quality includes
  `Student App AI Tutor question-bank draft visibility runtime audit`.
- The architecture board states 10.3/10 current progress for Student App AI
  Tutor question-bank draft metadata visibility while draft content retrieval,
  question generation, answering, scoring, and student-visible publication
  remain later reviewed slices.

## Rollback

Remove the Student App AI Tutor question-bank draft visibility schemas,
examples, runtime, tests, audit, audit tests, report, visibility log output,
`package.json` audit script, strict quality entry, root workflow coverage
requirement, structure-verifier entries, and architecture board text. Keep SDD
0260, SDD 0261, SDD 0262, and the Go
`ListStudentAppQuestionBankDrafts` endpoint intact because request admission,
worker claiming, result recording, and backend draft metadata listing remain
valid capabilities even without this JS control-plane evidence slice.
