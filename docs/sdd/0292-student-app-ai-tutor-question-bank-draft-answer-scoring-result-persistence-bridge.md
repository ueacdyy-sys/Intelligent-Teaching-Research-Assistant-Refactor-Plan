# SDD 0292 - Student App AI Tutor Question-Bank Draft Answer Scoring Result Persistence Bridge

## Problem

SDD 0291 records a sanitized, controlled scoring artifact for a student's
question-bank draft answer. The next whole-system refactor slice must prove that
this artifact can enter the existing `RecordAIGradingResult` result state
machine without adding a parallel persistence API, leaking answer keys, or
publishing learner feedback.

This slice is a bridge from the controlled scoring artifact to existing result
persistence. It is not a feedback generator and not a student-visible
publication slice.

## Scope

In scope:

- Consume the 0291 controlled scoring artifact report.
- Validate that the 0291 source has no answer text, expected answer,
  explanation, answer key, raw model output, direct database access, HTTP calls,
  local tool mutation, remote device control, or Swarm execution.
- Build a metadata-only `RecordAIGradingResult` input with `SUCCEEDED`,
  `scoreSummary`, and a controlled scoring artifact `resultRef`.
- Invoke only
  `StudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridgePort.recordAIGradingResult`.
- Require `SERVICE + AGENT_INTERNAL + TEACHING_WRITE`.
- Record
  `STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTED`.
- Preserve source artifact id, request id, worker id, score summary, and
  evidence refs.
- Add SDD, runtime, tests, audit, strict quality hook, root workflow coverage,
  structure verification, report evidence, and architecture-board progress.

Out of scope:

- Creating a new OpenAPI path or duplicate result API.
- Direct database access from this runtime.
- Generating learner feedback.
- Publishing student-visible feedback.
- Writing teaching archive rows for feedback.
- Exposing answer text, expected answers, explanations, answer keys, raw model
  output, worker-only internals, or internal errors to students.
- Re-running production10k, because this slice does not change the production
  performance hot path.

## Contracts

Runtime id:

`student_app_ai_tutor_question_bank_draft_answer_scoring_result_persistence_bridge_runtime`

Command port:

`StudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridgePort.recordAIGradingResult`

Target use case:

`RecordAIGradingResult.Execute`

Target operation id:

`recordTeachingAIGradingWorkerResult`

Status:

`STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTED`

Report key:

`studentAppAiTutorQuestionBankDraftAnswerScoringResultPersistenceBridge`

Report path:

`reports/student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge.current.json`

Execution state:

`SCORING_RESULT_PERSISTED_VIA_RECORD_AI_GRADING_RESULT`

## Acceptance Criteria

- Runtime passes 0291 controlled scoring artifact readiness checks.
- Runtime builds a `RecordAIGradingResult` input with `status = SUCCEEDED`,
  source worker id, safe score summary, and a controlled score artifact result
  ref.
- Runtime invokes exactly the injected result persistence bridge port in tests.
- Runtime rejects idempotency conflicts.
- Runtime rejects missing ports, unsafe principals, unsafe policies, unsafe
  source reports, missing source evidence, leaked answer/model fields, unsafe
  port results, and result refs that do not point to the controlled scoring
  artifact.
- Runtime does not direct-connect to PostgreSQL, execute HTTP, spawn processes,
  generate feedback, publish to students, mutate local tools, control remote
  devices, or use Swarm.
- Audit report is `READY`, `P99 <= 50ms`, and `totalErrors = 0`.
- Strict quality gate, root workflow coverage, structure verifier, package
  script, SDD, and architecture board all track 0292.
- Architecture board states that this slice persists the scoring result through
  the existing result boundary but still does not generate learner feedback or
  publish student-visible feedback.

## Rollback

Remove the 0292 runtime, tests, audit, audit tests, report, SDD, command-log
entry, package script, quality gate hook, root workflow coverage hook, structure
verifier entry, and architecture board 10.32/10 text. The 0291 controlled
scoring artifact remains the previous safe boundary.
