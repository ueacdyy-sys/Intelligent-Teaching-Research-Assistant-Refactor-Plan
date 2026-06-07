# SDD 0293 - Student App AI Tutor Question-Bank Draft Answer Feedback Publication Precheck Persisted Scoring Source

## Problem

SDD 0271 originally blocked student-visible feedback publication on top of the
0270 scoring completion bridge. SDD 0292 introduced stronger source evidence:
the controlled scoring artifact is now persisted through the existing
`RecordAIGradingResult` state machine.

The whole-system refactor should not let feedback review and publication depend
only on a weaker "scoring completed" signal when a persisted scoring result
boundary exists.

## Scope

Upgrade the existing 0271 feedback publication precheck runtime and audit so
that it consumes the 0292 scoring result persistence bridge report.

The existing report path and runtime id are preserved:

- `student_app_ai_tutor_question_bank_draft_answer_feedback_publication_precheck_runtime`
- `reports/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck.current.json`

This is a source-evidence upgrade, not a new student-visible feature.

## Contracts

- Upgraded runtime:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck-runtime.mjs`
- Upgraded runtime tests:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck-runtime.test.mjs`
- Upgraded audit:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck-audit.mjs`
- Downstream consumer adjusted:
  `tools/student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-runtime.mjs`
- Report:
  `reports/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck.current.json`
- Source evidence:
  `reports/student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge.current.json`

## Acceptance Criteria

- 0271 requires READY 0292 scoring result persistence bridge evidence.
- 0271 verifies the persisted scoring result and safe Student App scoring result
  agree on `requestId` and `submissionId`.
- 0271 still records `BLOCK_UNTIL_REVIEWED_FEEDBACK`.
- 0271 still blocks feedback generation, publication, resultRef disclosure,
  answer-key disclosure, raw model output, DB, HTTP, local tool mutation, remote
  device control, and Swarm.
- 0272 reviewed feedback artifact admission accepts the upgraded precheck
  invariant `scoringResultPersistenceRequired`.
- No production10k rerun is required because this slice changes control-plane
  evidence and downstream guards, not the Go hot path.

## Verification

- `node --test tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck-runtime.test.mjs`
- `node --test tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck-audit.test.mjs`
- `node --test tools/student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-runtime.test.mjs`
- `node --test tools/student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-audit.test.mjs`
- `npm run audit:student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck`
- `npm run audit:student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact`

## Rollback

Restore 0271 to the 0270 completion bridge source contract, restore 0272 to
`scoringCompletionBridgeRequired`, remove this 0293 SDD and the 10.33
architecture-board note. Keep 0292 intact because scoring result persistence is
still independently valid.
