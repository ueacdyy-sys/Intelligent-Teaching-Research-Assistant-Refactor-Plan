# SDD 0288 - Student App AI Tutor Question-Bank Draft Answer Submission Verification

## Problem

SDD 0287 proves that a Student App principal can safely read teacher-reviewed
question-bank draft content. SDD 0266 proves the Go answer submission
foundation exists. The system still needs runtime evidence that the student
read boundary can be followed by an own-student answer submission without
leaking submitted answer text back to the client, exposing answer keys, starting
scoring, publishing feedback, or running model inference.

## Scope

This slice consumes:

- `reports/student-app-ai-tutor-question-bank-draft-content-student-read-verification.current.json`
- `reports/student-app-ai-tutor-question-bank-draft-answer-submission.current.json`

It calls only an injected answer submission port:
`StudentQuestionBankDraftAnswerSubmissionPort.submitStudentAppQuestionBankDraftAnswer`.

It verifies:

- the source 0287 content student read verification report is READY;
- the source 0266 answer submission foundation report is READY;
- the caller is `STUDENT + STUDENT_APP + STUDENT_OWN_READ +
  STUDENT_OWN_WRITE + OWN`;
- submitted answer item ids match the verified safe read items;
- duplicate or unknown answer items are rejected before submission;
- the target use case is
  `SubmitStudentAppQuestionBankDraftAnswer.ExecuteWithPersistence`;
- the repository boundary is
  `ArchiveRepository.SubmitQuestionBankDraftAnswerSubmission`;
- the endpoint contract remains
  `POST /v1/student-app/question-bank-draft-answer-submissions`;
- the response is metadata-only and includes answer count but not submitted
  answer text, expected answers, explanations, answer keys, score summaries,
  worker state, raw model output, or internal errors;
- scoring, feedback publication, model inference, raw DB access, HTTP
  execution, local tool mutation, remote control, and Swarm remain future-gated.

Out of scope:

- real answer scoring;
- AI feedback generation;
- feedback publication;
- feedback archive persistence;
- model inference;
- direct database/SQL access from JS;
- HTTP execution from the JS audit runtime;
- local tool mutation;
- Swarm.

## Contracts

- Runtime:
  `tools/student-app-ai-tutor-question-bank-draft-answer-submission-verification-runtime.mjs`
- Runtime tests:
  `tools/student-app-ai-tutor-question-bank-draft-answer-submission-verification-runtime.test.mjs`
- Audit:
  `tools/student-app-ai-tutor-question-bank-draft-answer-submission-verification-audit.mjs`
- Audit tests:
  `tools/student-app-ai-tutor-question-bank-draft-answer-submission-verification-audit.test.mjs`
- Report:
  `reports/student-app-ai-tutor-question-bank-draft-answer-submission-verification.current.json`

Runtime status:

- `STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFIED`

Root workflow key:

- `studentAppAiTutorQuestionBankDraftAnswerSubmissionVerification`

## Acceptance Criteria

- 0287 report is READY and has
  `safeStudentResponseMatchedVerifiedPreview=true`.
- 0266 report is READY and has own-student write and metadata-only response
  safety invariants.
- Runtime invokes exactly the injected answer submission port in tests and audit
  probe.
- Runtime validates submitted answer item ids against the verified safe read
  items.
- Runtime output does not include answer text, answer keys, expected answers,
  explanations, worker state, scores, raw model output, or internal errors.
- Runtime keeps scoring, feedback publication, model inference, raw database
  access, HTTP execution, local tool mutation, remote control, and Swarm
  blocked.
- Audit is included in `package.json`, `tools/quality-gate.mjs`,
  `tools/root-workflow-coverage-audit.mjs`, `tools/verify-structure.mjs`, and
  `architecture-board.html`.
- Local verification commands pass:
  - `node --test tools/student-app-ai-tutor-question-bank-draft-answer-submission-verification-runtime.test.mjs tools/student-app-ai-tutor-question-bank-draft-answer-submission-verification-audit.test.mjs`
  - `npm run audit:student-app-ai-tutor-question-bank-draft-answer-submission-verification`
  - `npm run verify:structure`
  - `npm run audit:root-workflow-coverage`

## Rollback

Remove the 0288 runtime, tests, audit, audit tests, report, SDD, command-log
records, quality-gate entry, root workflow coverage references, structure
verifier entries, and architecture-board 10.28 references. Keep 0266 and 0287
evidence intact.
