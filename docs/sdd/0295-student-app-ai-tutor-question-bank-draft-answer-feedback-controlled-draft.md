# SDD 0295 - Student App AI Tutor Question-Bank Draft Answer Feedback Controlled Draft

## Problem

SDD 0294 proves that feedback generation can only enter a controlled
`StudentTutorAgent.generate_question_bank_answer_feedback` model queue. The
next product gap is the actual feedback draft boundary.

Without this slice, a later implementation could jump from queue admission to a
reviewed artifact or student-visible publication, or persist raw model output,
answer keys, result references, or internal errors in a learner-facing path.

## Scope

Add an auditable controlled feedback draft runtime for Student App AI Tutor
question-bank answer feedback generation.

This slice consumes:

- `reports/student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck.current.json`;
- the safe persisted-scoring result embedded in the 0294 source precheck;
- a SERVICE + AGENT_INTERNAL principal with explicit feedback draft generation
  scope;
- a bounded generation attempt for
  `StudentTutorAgent.generate_question_bank_answer_feedback`;
- an output policy that allows only a sanitized draft.

It invokes only:

`StudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraftPort.recordControlledFeedbackDraft`

It records:

`STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT_RECORDED`

## Out Of Scope

- reviewed feedback artifact recording;
- teacher approval or publication approval;
- student-visible feedback publication;
- archive persistence or database writes;
- resultRef, answer text, expected answer, explanation, answer-key, raw model
  output, worker trace, or internal error disclosure;
- direct database access, HTTP execution, local tool mutation, remote device
  control, or Swarm;
- production10k rerun.

## Contracts

- Runtime:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-controlled-draft-runtime.mjs`
- Runtime tests:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-controlled-draft-runtime.test.mjs`
- Audit:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-controlled-draft-audit.mjs`
- Audit tests:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-controlled-draft-audit.test.mjs`
- Report:
  `reports/student-app-ai-tutor-question-bank-draft-answer-feedback-controlled-draft.current.json`

Root workflow key:

`studentAppAiTutorQuestionBankDraftAnswerFeedbackControlledDraft`

## Acceptance Criteria

- Runtime requires READY 0294 feedback generation model execution precheck
  evidence.
- Runtime verifies the source precheck admitted only queue work and did not
  already generate or publish feedback.
- Runtime requires SERVICE + AGENT_INTERNAL with teaching write, student
  archive write, command submit, and feedback draft generation scopes.
- Runtime invokes only the injected controlled feedback draft port.
- Runtime may record sanitized learner-facing draft feedback.
- Runtime keeps reviewed artifact recording, student-visible publication,
  archive persistence, direct DB, HTTP, local tool mutation, remote control, and
  Swarm blocked.
- Runtime rejects leaked answer, expected answer, explanation, answer-key,
  resultRef, raw model output, worker trace, publication, and internal error
  fields.
- Runtime rejects feedback text that contains HTML-like markup, answer-key
  phrases, raw model details, result references, or internal errors.
- Audit is included in `package.json`, `tools/quality-gate.mjs`,
  `tools/root-workflow-coverage-audit.mjs`, `tools/verify-structure.mjs`, and
  `architecture-board.html`.

## Performance

This is a control-plane draft artifact step. It does not alter the Go hot path
or the existing production10k evidence. It is held to P99 <= 50ms. Current
whole-system performance evidence remains `22,435.1 read/write RPS`,
`P99 44.44ms`, `0 errors`; 10ms remains an excellence target, not a proven
durable full-system claim.

## Rollback

Remove the 0295 runtime, tests, audit, report, package script, quality-gate
entry, root workflow coverage entry, structure verifier entry, SDD, and
architecture-board 10.35 note. Keep 0294 intact because queue-admission-only
feedback generation precheck remains independently valid.
