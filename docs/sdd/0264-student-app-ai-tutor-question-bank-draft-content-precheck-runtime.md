# SDD 0264 - Student App AI Tutor Question-Bank Draft Content Precheck Runtime

## Problem

SDD 0263 proves that the Student App can list a student's own personalized
question-bank draft metadata when a completed AI Tutor result has a
`questionBankDraftRef`. That does not mean the system can safely return the
actual question content.

At the time of this slice, Go evidence only stored and listed the
`questionBankDraftRef` metadata on tutoring analysis requests. A content read
endpoint would therefore have been a false capability claim. SDD 0265 later
adds a separate storage-backed own-student content read foundation; this 0264
runtime remains a conservative precheck/fallback, not the content retrieval
path.

This slice adds a reviewed precheck boundary that consumes the 0263 visibility
evidence and returns a safe block decision: `BLOCK_UNTIL_CONTENT_STORE`. It is
not a draft content retrieval runtime, not a question generation runtime, not
an answering or scoring runtime, and not a student-visible publication runtime.

## Scope

Add a `Student App AI Tutor question-bank draft content precheck runtime`.

The command port is
`StudentAppAITutorQuestionBankDraftContentPrecheckPort.recordContentRetrievalPrecheck`.

This slice:

- requires a `USER` principal with `STUDENT` role and `STUDENT_APP` entry point
- requires `STUDENT_OWN_READ`
- requires `studentAccess.mode=OWN`
- consumes a verified 0263 draft visibility result
- requires the selected draft to match an item in the verified visibility page
- requires `contentPrecheckOnly=true`
- requires `contentStoreRequiredBeforeRead=true`
- requires the precheck request itself to declare
  `authoritativeContentStoreAvailable=false`
- records `BLOCK_UNTIL_CONTENT_STORE`
- rejects student ids, worker lease fields, draft content, questions, answers,
  answer keys, scores, and publication fields
- blocks draft content reads, question generation, student answering, scoring,
  student-visible publication, model inference, vector search, direct database
  access, HTTP execution, local tool mutation, remote device control, and Swarm
- keeps the control-plane precheck path inside a 50ms target

## Contracts

- Input schema:
  `contracts/agent/student-app-ai-tutor-question-bank-draft-content-precheck.input.schema.json`
- Output schema:
  `contracts/agent/student-app-ai-tutor-question-bank-draft-content-precheck.output.schema.json`
- Examples:
  `contracts/agent/student-app-ai-tutor-question-bank-draft-content-precheck.input.example.json`
  and
  `contracts/agent/student-app-ai-tutor-question-bank-draft-content-precheck.output.example.json`
- Runtime:
  `tools/student-app-ai-tutor-question-bank-draft-content-precheck-runtime.mjs`
- Runtime tests:
  `tools/student-app-ai-tutor-question-bank-draft-content-precheck-runtime.test.mjs`
- Audit:
  `tools/student-app-ai-tutor-question-bank-draft-content-precheck-audit.mjs`
- Audit tests:
  `tools/student-app-ai-tutor-question-bank-draft-content-precheck-audit.test.mjs`
- Source visibility evidence:
  `reports/student-app-ai-tutor-question-bank-draft-visibility.current.json`
- Metadata visibility evidence consumed by this precheck:
  `services/teaching-archive-gateway/internal/domain/student_app_question_bank_drafts.go`,
  `services/teaching-archive-gateway/internal/usecase/list_student_app_question_bank_drafts.go`,
  `services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis.go`,
  `services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_drafts.go`,
  and
  `contracts/openapi/teaching-archive.student-app-question-bank-drafts.path.yaml`
- Root workflow coverage:
  `tools/root-workflow-coverage-audit.mjs`
- Strict quality gate:
  `tools/quality-gate.mjs`

The append-only precheck log defaults to
`reports/student-command-log/student-app-ai-tutor-question-bank-draft-content-precheck.jsonl`.

## Acceptance Criteria

- `node --test tools/student-app-ai-tutor-question-bank-draft-content-precheck-runtime.test.mjs` passes.
- `node --test tools/student-app-ai-tutor-question-bank-draft-content-precheck-audit.test.mjs` passes.
- `npm run audit:student-app-ai-tutor-question-bank-draft-content-precheck` reports `READY`.
- `npm run audit:root-workflow-coverage` reports `READY` and requires
  `studentAppAiTutorQuestionBankDraftContentPrecheck`.
- `npm run verify:structure` requires this SDD, schemas, examples, runtime,
  runtime test, audit, and audit test.
- Strict quality includes
  `Student App AI Tutor question-bank draft content precheck runtime audit`.
- The architecture board states 10.4/10 as the safe question-bank draft content
  precheck and 10.5/10 as the separate content-store/read foundation, while
  question generation, answering, scoring, and student-visible publication
  remain later reviewed slices.

## Rollback

Remove the Student App AI Tutor question-bank draft content precheck schemas,
examples, runtime, tests, audit, audit tests, report, precheck log output,
`package.json` audit script, strict quality entry, root workflow coverage
requirement, structure-verifier entries, and architecture board text. Keep SDD
0260, SDD 0261, SDD 0262, SDD 0263, and the Go
`ListStudentAppQuestionBankDrafts` metadata endpoint intact because request
admission, worker claiming, result recording, and draft metadata listing remain
valid capabilities without a content read precheck.
