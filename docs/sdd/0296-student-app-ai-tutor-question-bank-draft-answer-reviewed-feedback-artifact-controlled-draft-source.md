# SDD 0296 - Student App AI Tutor Question-Bank Draft Answer Reviewed Feedback Artifact Controlled Draft Source

## Problem

SDD 0295 proves that `StudentTutorAgent.generate_question_bank_answer_feedback`
can produce only a sanitized controlled feedback draft. The remaining product
gap is source traceability for human review.

Without this slice, a later publication approval step could still accept a
reviewed feedback artifact that was typed manually, derived from an unsafe
model output, or disconnected from the controlled draft evidence chain.

## Scope

Add an auditable reviewed feedback artifact runtime that must consume the READY
0295 controlled feedback draft report.

This slice consumes:

- `reports/student-app-ai-tutor-question-bank-draft-answer-feedback-controlled-draft.current.json`;
- the sanitized `feedbackDraft` produced by 0295;
- the safe Student App scoring result embedded in the controlled draft;
- a human TEACHER or ADMIN reviewer;
- a review checklist proving the controlled draft source was verified;
- a policy that still blocks publication, database writes, HTTP, model
  inference, tools, devices, and Swarm.

It invokes only:

`StudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSourcePort.recordReviewedFeedbackArtifactFromControlledDraft`

It records:

`STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_FROM_CONTROLLED_DRAFT_RECORDED`

## Out Of Scope

- student-visible feedback publication;
- publication approval;
- archive persistence or database writes;
- direct model inference during review;
- resultRef, answer text, expected answer, explanation, answer-key, raw model
  output, worker trace, worker metadata, or internal error disclosure;
- direct database access, HTTP execution, local tool mutation, remote device
  control, or Swarm;
- production10k rerun.

## Contracts

- Runtime:
  `tools/student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-controlled-draft-source-runtime.mjs`
- Runtime tests:
  `tools/student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-controlled-draft-source-runtime.test.mjs`
- Audit:
  `tools/student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-controlled-draft-source-audit.mjs`
- Audit tests:
  `tools/student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-controlled-draft-source-audit.test.mjs`
- Report:
  `reports/student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-controlled-draft-source.current.json`

Root workflow key:

`studentAppAiTutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource`

## Acceptance Criteria

- Runtime requires READY 0295 controlled feedback draft evidence.
- Runtime verifies the source draft was generated under the controlled worker
  boundary and has not already become a reviewed artifact or student-visible
  publication.
- Runtime requires USER reviewer identity with TEACHER/ADMIN role and review
  scope.
- Reviewed artifact must carry `sourceControlledDraft` with source runtime,
  record id, artifact id, generation attempt, input hash, and draft feedback
  hash.
- Human review must prove controlled draft source verification, age
  appropriateness, own-student scope, answer-key removal, worker metadata
  removal, raw model output removal, resultRef removal, internal error removal,
  and publication approval still required.
- Runtime invokes only the injected reviewed feedback artifact port.
- Runtime keeps publication approval, student-visible delivery, archive
  persistence, direct DB, HTTP, model inference, local tool mutation, remote
  control, and Swarm blocked.
- Runtime rejects leaked answer, expected answer, explanation, answer-key,
  resultRef, raw model output, worker trace, publication, and internal error
  fields.
- Audit is included in `package.json`, `tools/quality-gate.mjs`,
  `tools/root-workflow-coverage-audit.mjs`, `tools/verify-structure.mjs`, and
  `architecture-board.html`.

## Performance

This is a control-plane review artifact step. It does not alter the Go hot path
or the existing production10k evidence. It is held to P99 <= 50ms. Current
whole-system performance evidence remains `22,435.1 read/write RPS`,
`P99 44.44ms`, `0 errors`; 10ms remains an excellence target, not a proven
durable full-system claim.

## Rollback

Remove the 0296 runtime, tests, audit, report, package script, quality-gate
entry, root workflow coverage entry, structure verifier entry, SDD, and
architecture-board 10.36 note. Keep 0295 intact because controlled draft
generation remains independently valid.
