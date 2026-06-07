# SDD 0289 - Student App AI Tutor Question-Bank Draft Answer Scoring Request Verification

## Problem

SDD 0288 proves that a Student App principal can safely submit answers for a
teacher-reviewed question-bank draft. SDD 0267 proves the Go scoring-request
foundation can queue a metadata-only `AIGradingRequest`. The system still needs
runtime evidence that the verified answer submission can be followed by a safe
own-student scoring request without starting real model inference, exposing
answer text or keys, publishing feedback, or bypassing the existing queue.

## Scope

This slice consumes:

- `reports/student-app-ai-tutor-question-bank-draft-answer-submission-verification.current.json`
- `reports/student-app-ai-tutor-question-bank-draft-answer-scoring-request.current.json`

It calls only an injected scoring request port:
`StudentQuestionBankDraftAnswerScoringRequestPort.createStudentAppQuestionBankDraftAnswerScoringRequest`.

It verifies:

- the source 0288 answer submission verification report is READY;
- the source 0267 scoring request foundation report is READY;
- the caller is `STUDENT + STUDENT_APP + STUDENT_OWN_READ +
  STUDENT_OWN_WRITE + OWN`;
- the submission id, question-bank draft ref, tutoring request, archive item,
  and submitted answer item ids come from the verified 0288 submission result;
- the scoring request uses
  `CreateStudentAppQuestionBankDraftAnswerScoringRequest.Execute`;
- the repository boundary is `ArchiveRepository.CreateAIGradingRequest`;
- the endpoint contract remains
  `POST /v1/student-app/question-bank-draft-answer-submissions/{submissionId}/ai-grading-requests`;
- the scoring request is queued on the existing `AIGradingRequest` queue with
  question-bank source refs;
- the response is metadata-only and does not include answer text, expected
  answers, explanations, answer keys, score summaries, result refs, feedback,
  worker state, raw model output, or internal errors;
- model inference, scoring execution, feedback publication, raw DB access, HTTP
  execution, local tool mutation, remote control, and Swarm remain blocked.

Out of scope:

- real answer scoring;
- worker scoring input retrieval;
- AI feedback generation;
- student-visible feedback publication;
- feedback archive persistence;
- model inference;
- direct database/SQL access from JS;
- HTTP execution from the JS audit runtime;
- local tool mutation;
- Swarm.

## Contracts

- Runtime:
  `tools/student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification-runtime.mjs`
- Runtime tests:
  `tools/student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification-runtime.test.mjs`
- Audit:
  `tools/student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification-audit.mjs`
- Audit tests:
  `tools/student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification-audit.test.mjs`
- Report:
  `reports/student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification.current.json`

Runtime status:

- `STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFIED`

Root workflow key:

- `studentAppAiTutorQuestionBankDraftAnswerScoringRequestVerification`

## Acceptance Criteria

- 0288 report is READY and has persisted own-student answer submission
  verification.
- 0267 report is READY and has own-student write, scoped lookup, existing queue
  reuse, and metadata-only response invariants.
- Runtime invokes exactly the injected scoring request port in tests and audit
  probe.
- Runtime validates the queued request against the 0288 verified submission id,
  question-bank draft ref, archive item, tutoring request, and submitted item
  ids.
- Runtime output does not include answer text, answer keys, expected answers,
  explanations, worker state, scores, result refs, feedback, raw model output,
  or internal errors.
- Runtime keeps real scoring, model inference, feedback publication, raw
  database access, HTTP execution, local tool mutation, remote control, and
  Swarm blocked.
- Audit is included in `package.json`, `tools/quality-gate.mjs`,
  `tools/root-workflow-coverage-audit.mjs`, `tools/verify-structure.mjs`, and
  `architecture-board.html`.
- Local verification commands pass:
  - `node --test tools/student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification-runtime.test.mjs tools/student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification-audit.test.mjs`
  - `npm run audit:student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification`
  - `npm run verify:structure`
  - `npm run audit:root-workflow-coverage`

## Rollback

Remove the 0289 runtime, tests, audit, audit tests, report, SDD, command-log
records, quality-gate entry, root workflow coverage references, structure
verifier entries, and architecture-board 10.29 references. Keep 0267 and 0288
evidence intact.
