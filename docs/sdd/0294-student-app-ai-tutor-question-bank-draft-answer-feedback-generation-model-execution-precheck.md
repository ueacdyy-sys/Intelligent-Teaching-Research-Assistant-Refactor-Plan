# SDD 0294 - Student App AI Tutor Question-Bank Draft Answer Feedback Generation Model Execution Precheck

## Problem

SDD 0293 upgrades feedback publication precheck so it must depend on the 0292
persisted scoring result boundary. The next product gap is not another
performance run; it is the controlled model boundary for future learner
feedback generation.

Without this slice, a later StudentTutorAgent feedback worker could jump
directly from a persisted score to generated prose, skip teacher/service
approval, leak answer-key or raw model data, or accidentally publish feedback
to the student before review.

## Scope

Add an auditable model-execution precheck for future Student App AI Tutor
question-bank answer feedback generation.

This slice consumes:

- `reports/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck.current.json`
- the persisted-scoring verification embedded in that 0293 precheck report;
- a SERVICE + AGENT_INTERNAL principal with explicit feedback generation model
  precheck approval scope;
- a teacher/admin approval for queue admission only;
- a budgeted model execution policy for
  `StudentTutorAgent.generate_question_bank_answer_feedback`.

It invokes only:

`StudentAppAITutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheckPort.recordFeedbackGenerationModelExecutionPrecheck`

It records:

`STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_GENERATION_MODEL_EXECUTION_PRECHECKED`

## Out Of Scope

- real model inference;
- learner feedback draft generation;
- reviewed feedback artifact recording;
- student-visible feedback publication;
- resultRef disclosure;
- answer text, expected answer, explanation, answer-key, raw model output, or
  internal error disclosure;
- direct database access, HTTP execution, local tool mutation, remote device
  control, or Swarm;
- production10k rerun.

## Contracts

- Runtime:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck-runtime.mjs`
- Runtime tests:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck-runtime.test.mjs`
- Audit:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck-audit.mjs`
- Audit tests:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck-audit.test.mjs`
- Report:
  `reports/student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck.current.json`

Root workflow key:

`studentAppAiTutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck`

## Acceptance Criteria

- Runtime requires READY 0293 feedback publication precheck evidence.
- Runtime verifies scoring result persistence and safe Student App scoring
  result are already proven by the source precheck.
- Runtime requires SERVICE + AGENT_INTERNAL with teaching write, student archive
  write, command submit, and feedback generation model precheck approval scopes.
- Runtime requires teacher/admin approval for
  `FEEDBACK_GENERATION_MODEL_QUEUE_ONLY`.
- Runtime invokes only the injected feedback generation model execution
  precheck port.
- Runtime emits a queue-admission-only record for
  `StudentTutorAgent.generate_question_bank_answer_feedback`.
- Runtime keeps model inference, feedback draft generation, reviewed artifact
  recording, student publication, direct DB, HTTP, local tool mutation, remote
  control, and Swarm blocked.
- Runtime and audit reject leaked answer, expected answer, explanation,
  answer-key, resultRef, raw model output, learner feedback, publication, and
  internal error fields.
- Audit is included in `package.json`, `tools/quality-gate.mjs`,
  `tools/root-workflow-coverage-audit.mjs`, `tools/verify-structure.mjs`, and
  `architecture-board.html`.

## Performance

This is a control-plane queue-admission precheck. It does not alter the Go hot
path or the existing production10k evidence. It is held to P99 <= 50ms. Current
whole-system performance evidence remains `22,435.1 read/write RPS`,
`P99 44.44ms`, `0 errors`; 10ms remains an excellence target, not a proven
durable full-system claim.

## Rollback

Remove the 0294 runtime, tests, audit, report, package script, quality-gate
entry, root workflow coverage entry, structure verifier entry, SDD, and
architecture-board 10.34 note. Keep 0293 intact because the persisted scoring
source upgrade is independently valid.
