# SDD 0291 - Student App AI Tutor Question-Bank Draft Answer Controlled Scoring Artifact

## Problem

SDD 0290 proves that a student's verified question-bank draft answer scoring
request can pass a reviewed model-execution precheck. The next whole-system
refactor slice must move beyond queue admission: the controlled StudentTutorAgent
worker needs an auditable scoring artifact that can later be persisted through
the existing `RecordAIGradingResult` path.

This slice must not collapse into result persistence, learner feedback
generation, student-visible publication, database writes, HTTP calls, local tool
mutation, or Swarm execution.

## Scope

In scope:

- Consume the 0290 model execution precheck report.
- Consume the 0268 worker-only scoring input foundation report.
- Accept a protected worker scoring input package inside the controlled runtime.
- Invoke only
  `StudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifactPort.recordControlledScoringArtifact`.
- Record
  `STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT_RECORDED`.
- Emit a sanitized scoring artifact with item scores and score summary.
- Preserve hashes and evidence refs for the protected answer package.
- Keep the artifact in `SCORING_ARTIFACT_RECORDED_NOT_PERSISTED` state.
- Add SDD, runtime, tests, audit, strict quality hook, root workflow coverage,
  structure verification, report evidence, and architecture-board progress.

Out of scope:

- Persisting `AIGradingResult`.
- Updating `ai_grading_requests`.
- Generating learner feedback prose.
- Publishing student-visible feedback.
- Writing teaching archive rows.
- Direct database access, HTTP calls, shell/process execution, local tool
  mutation, remote device control, or Swarm execution.
- Re-running production10k, because this slice does not change a performance
  hot path.

## Contracts

Runtime id:

`student_app_ai_tutor_question_bank_draft_answer_controlled_scoring_artifact_runtime`

Command port:

`StudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifactPort.recordControlledScoringArtifact`

Status:

`STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT_RECORDED`

Report key:

`studentAppAiTutorQuestionBankDraftAnswerControlledScoringArtifact`

Report path:

`reports/student-app-ai-tutor-question-bank-draft-answer-controlled-scoring-artifact.current.json`

Model route:

`StudentTutorAgent.score_question_bank_answer`

Execution state:

`SCORING_ARTIFACT_RECORDED_NOT_PERSISTED`

## Acceptance Criteria

- Runtime passes source report readiness checks for 0290 and 0268.
- Runtime allows protected worker answer input only inside the controlled input
  package and never echoes answer text, expected answers, explanations, answer
  keys, raw model output, or internal errors.
- Runtime requires `SERVICE + AGENT_INTERNAL` principal and
  `ANSWER_SCORING_MODEL_EXECUTE`.
- Runtime invokes exactly the injected scoring artifact port in tests.
- Runtime rejects idempotency conflicts.
- Runtime rejects unsafe source reports, broken request/submission/item linkage,
  unsafe policies, unsafe port results, invalid score totals, and missing
  evidence refs.
- Audit report is `READY`, `P99 <= 50ms`, and `totalErrors = 0`.
- Strict quality gate, root workflow coverage, structure verifier, package
  script, SDD, and architecture board all track 0291.
- Architecture board states that this is a controlled scoring artifact only, not
  persisted result, reviewed feedback, publication, complete AI Tutor, or a new
  production10k performance claim.

## Rollback

Remove the 0291 runtime, tests, audit, audit tests, report, SDD, command-log
entry, package script, quality gate hook, root workflow coverage hook, structure
verifier entry, and architecture board 10.31/10 text. The 0290 precheck remains
the previous safe boundary.
