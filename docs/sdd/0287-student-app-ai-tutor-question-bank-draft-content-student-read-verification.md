# SDD 0287 - Student App AI Tutor Question-Bank Draft Content Student Read Verification

## Problem

SDD 0265 proves the Go own-student content read foundation exists, and SDD 0286
proves teacher-reviewed generated content can be read back from the physical
`teaching_question_bank_draft_contents` row. The system still needs a separate
runtime evidence slice that proves a Student App principal can read that
verified content through the student-safe read boundary without leaking answer
keys, explanations, student ownership internals, worker state, scores, or model
output.

## Scope

This slice consumes:

- `reports/student-app-ai-tutor-question-bank-draft-generation-content-row-verification.current.json`
- `reports/student-app-ai-tutor-question-bank-draft-content-read.current.json`

It calls only an injected student read port:
`StudentQuestionBankDraftContentReadPort.readStudentAppQuestionBankDraftContent`.

It verifies:

- the source 0286 content row verification report is READY;
- the source 0265 content read foundation report is READY;
- the caller is `STUDENT + STUDENT_APP + STUDENT_OWN_READ + OWN`;
- the read target is `ReadStudentAppQuestionBankDraftContent.Execute`;
- the repository boundary is `ArchiveRepository.GetQuestionBankDraftContentForStudent`;
- the endpoint contract remains `GET /v1/student-app/question-bank-draft-content`;
- returned items match the safe preview from 0286;
- the response excludes `studentId`, worker state, score fields,
  `expectedAnswer`, `explanation`, answer keys, raw model output, and internal
  errors;
- answering, scoring, feedback publication, model inference, raw DB access,
  HTTP execution, local tool mutation, and Swarm remain future-gated.

Out of scope:

- student answer submission execution;
- real scoring execution;
- feedback publication;
- model inference;
- direct database/SQL access from JS;
- HTTP execution from the JS audit runtime;
- local tool mutation;
- Swarm.

## Contracts

- Runtime:
  `tools/student-app-ai-tutor-question-bank-draft-content-student-read-verification-runtime.mjs`
- Runtime tests:
  `tools/student-app-ai-tutor-question-bank-draft-content-student-read-verification-runtime.test.mjs`
- Audit:
  `tools/student-app-ai-tutor-question-bank-draft-content-student-read-verification-audit.mjs`
- Audit tests:
  `tools/student-app-ai-tutor-question-bank-draft-content-student-read-verification-audit.test.mjs`
- Report:
  `reports/student-app-ai-tutor-question-bank-draft-content-student-read-verification.current.json`

Runtime status:

- `STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFIED`

Root workflow key:

- `studentAppAiTutorQuestionBankDraftContentStudentReadVerification`

## Acceptance Criteria

- 0286 report is READY and has `physicalDatabaseRowVerified=true`.
- 0265 report is READY and has own-student scoped content read safety
  invariants.
- Runtime invokes exactly the injected student read port in tests and audit
  probe.
- Runtime output matches the 0286 safe student preview.
- Runtime output does not include answer keys, `expectedAnswer`, `explanation`,
  student id, worker state, scores, publication state, raw model output, or
  internal errors.
- Runtime keeps answering, scoring, feedback publication, model inference, raw
  database access, HTTP execution, local tool mutation, and Swarm blocked.
- Audit is included in `package.json`, `tools/quality-gate.mjs`,
  `tools/root-workflow-coverage-audit.mjs`, `tools/verify-structure.mjs`, and
  `architecture-board.html`.
- Local verification commands pass:
  - `node --test tools/student-app-ai-tutor-question-bank-draft-content-student-read-verification-runtime.test.mjs tools/student-app-ai-tutor-question-bank-draft-content-student-read-verification-audit.test.mjs`
  - `npm run audit:student-app-ai-tutor-question-bank-draft-content-student-read-verification`
  - `npm run verify:structure`
  - `npm run audit:root-workflow-coverage`

## Rollback

Remove the 0287 runtime, tests, audit, audit tests, report, SDD, command-log
records, quality-gate entry, root workflow coverage references, structure
verifier entries, and architecture-board 10.27 references. Keep 0265 and 0286
evidence intact.
