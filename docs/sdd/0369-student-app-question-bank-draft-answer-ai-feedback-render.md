# SDD 0369: Student App Question-Bank Draft Answer AI Feedback Render

## Problem

SDD 0368 made a reviewed and archived question-bank draft answer feedback card readable by the Student App. The next product boundary is rendering that safe card into a stable UI envelope so mobile clients do not infer layout, concatenate fields, or accidentally expose unsafe internals.

This is still a whole-system refactor slice. It serves the immutable root requirement for Student App AI tutor and personalized question-bank workflows while keeping raw answers, answer keys, model output, OCR/RAG, Swarm, and database details outside the student-facing product surface.

## Scope

Add `GET /v1/student-app/question-bank-draft-answer-submissions/{submissionId}/ai-feedback/rendered`.

The endpoint:

- reuses `ReadStudentAppQuestionBankDraftAnswerFeedback.Execute`;
- renders only the already safe feedback card into `SAFE_TEXT_BLOCKS`;
- returns deterministic block types: `SCORE_SUMMARY`, `FEEDBACK_SUMMARY`, `ENCOURAGEMENT`, `NEXT_STEP`, `MISCONCEPTION_TAG`, and `PRACTICE_SUGGESTION`;
- preserves student ownership, submission lineage, reviewed/archive timestamps, and feedback archive identity;
- does not call a model, OCR, RAG, Swarm, object storage, or any raw answer source.

## Contracts

- OpenAPI path: `contracts/openapi/teaching-archive.student-app-question-bank-draft-answer-submission-ai-feedback-rendered.path.yaml`
- Go use case: `RenderStudentAppQuestionBankDraftAnswerFeedback.Execute`
- Domain builder: `BuildQuestionBankDraftAnswerFeedbackRenderEnvelope`
- Response render format: `SAFE_TEXT_BLOCKS`

The response must not include:

- submitted answer text;
- answer keys, expected answers, explanations;
- `contentRef`, `resultRef`, raw model output, prompts, worker/claim fields;
- `studentId`, database row internals, OCR/RAG chunks, Swarm/tool metadata;
- rendered HTML or rendered Markdown.

## Acceptance Criteria

- Domain tests prove a safe feedback card becomes deterministic `SAFE_TEXT_BLOCKS`.
- Domain tests reject unsafe text, wrong status, missing IDs, and missing timestamps.
- Use case tests prove rendering uses the safe feedback reader instead of repository shortcuts.
- HTTP tests prove the rendered endpoint returns only safe text blocks.
- HTTP tests prove teacher, remote, cross-student, and unsupported method cases are rejected.
- `npm run verify:structure`, targeted Go tests, and `npm run quality` pass.

## Performance Boundary

This is a read-only CPU-local render over an already fetched safe card. It does not add database round trips beyond SDD 0368, does not add shared cache, and does not change Docker/WSL worker or PgBouncer performance configuration. The full-system performance claim remains the existing production10k evidence: 22,435.1 read/write RPS, P99 44.44ms, 0 errors.

## Rollback

Remove the 0369 OpenAPI path, domain/usecase/http additions and tests, remove the `RenderStudentAppQuestionBankDraftAnswerFeedback` server wiring, and remove the 0369 row from the root trace and architecture board.
