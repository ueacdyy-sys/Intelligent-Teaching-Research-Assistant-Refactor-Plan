# SDD 0290 - Student App AI Tutor Question-Bank Draft Answer Scoring Model Execution Precheck

## Problem

SDD 0289 proves that an owning Student App principal can safely queue a
question-bank draft answer scoring request on the existing `AIGradingRequest`
queue. SDD 0268 proves the internal worker-only path for resolving the protected
answer scoring input package. The next risk is the model execution boundary:
the system needs an auditable precheck that admits a verified answer scoring
request into a future model-scoring queue without running inference, persisting
scores, generating feedback, or widening student-visible data.

Without this slice, later model scoring could bypass the verified student
submission, ignore the worker-only input boundary, or collapse scoring,
result persistence, and feedback publication into one unsafe step.

## Scope

This slice consumes:

- `reports/student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification.current.json`
- `reports/student-app-ai-tutor-question-bank-draft-answer-scoring-input.current.json`

It calls only an injected precheck port:
`StudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheckPort.recordAnswerScoringModelExecutionPrecheck`.

It verifies:

- the 0289 scoring request verification report is READY and queued;
- the 0268 worker-only scoring input foundation is READY;
- the caller is `SERVICE + AGENT_INTERNAL` with teaching write, student archive
  write, command submit, and answer-scoring model precheck approval scopes;
- the scoring input manifest metadata matches the verified request id,
  submission id, question-bank draft ref, archive item, tutoring request, worker
  id, and submitted answer item ids;
- a teacher/admin approval explicitly approves model queue admission only;
- the model execution policy is budgeted, route-bound, and future-scoring only;
- the runtime records a precheck state of
  `MODEL_EXECUTION_PRECHECKED_NOT_STARTED`;
- the output remains metadata-only and does not include answer text, expected
  answers, explanations, answer keys, scores, result refs, feedback, raw model
  output, worker internals beyond the selected worker id, internal errors, or
  publication state;
- direct database access, HTTP execution, local tool mutation, remote control,
  Swarm, real model inference, scoring execution, result persistence, feedback
  generation, and student-visible publication remain blocked.

Out of scope:

- real model inference;
- score calculation;
- `RecordAIGradingResult` execution;
- detailed feedback generation;
- student-visible feedback publication;
- feedback archive persistence;
- direct database/SQL access from JS;
- HTTP execution from the JS audit runtime;
- local tool mutation;
- Swarm.

## Contracts

- Runtime:
  `tools/student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck-runtime.mjs`
- Runtime tests:
  `tools/student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck-runtime.test.mjs`
- Audit:
  `tools/student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck-audit.mjs`
- Audit tests:
  `tools/student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck-audit.test.mjs`
- Report:
  `reports/student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck.current.json`

Runtime status:

- `STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECKED`

Root workflow key:

- `studentAppAiTutorQuestionBankDraftAnswerScoringModelExecutionPrecheck`

## Acceptance Criteria

- 0289 report is READY and proves own-student scoring request queueing with no
  model inference, scoring execution, feedback publication, direct DB, HTTP, or
  Swarm.
- 0268 report is READY and proves the worker-only protected scoring input
  foundation with service principal, claim lease, and source linkage checks.
- Runtime invokes exactly the injected model execution precheck port in tests
  and audit probe.
- Runtime validates the scoring input manifest against the 0289 verified
  request id, submission id, question-bank draft ref, archive item, tutoring
  request, worker id, and submitted item ids.
- Runtime requires teacher/admin approval and a future-scoring-only model
  execution policy.
- Runtime output does not include answer text, answer keys, expected answers,
  explanations, scores, result refs, feedback, raw model output, direct DB
  details, HTTP execution details, or internal errors.
- Runtime keeps real model inference, scoring execution, result persistence,
  feedback generation, feedback publication, local tool mutation, remote
  control, and Swarm blocked.
- Audit is included in `package.json`, `tools/quality-gate.mjs`,
  `tools/root-workflow-coverage-audit.mjs`, `tools/verify-structure.mjs`, and
  `architecture-board.html`.
- Local verification commands pass:
  - `node --test tools/student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck-runtime.test.mjs tools/student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck-audit.test.mjs`
  - `npm run audit:student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck`
  - `npm run verify:structure`
  - `npm run audit:root-workflow-coverage`

## Performance

This slice does not change the production hot path shape or add broad
`production10k` evidence. Current whole-system evidence remains
`22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`; this supports the 10k RPS
/ 50ms class, while 10ms remains an optimization target for future hot-path
work.

## Rollback

Remove the 0290 runtime, tests, audit, audit tests, report, SDD, command-log
records, quality-gate entry, root workflow coverage references, structure
verifier entries, and architecture-board 10.30 references. Keep 0268 and 0289
evidence intact.
