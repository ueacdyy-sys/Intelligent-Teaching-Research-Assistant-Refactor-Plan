# SDD 0370: Student App Question-Bank Draft Answer AI Feedback Learning Actions

## Problem

SDD 0369 renders reviewed question-bank draft answer feedback into `SAFE_TEXT_BLOCKS`, but the Student App still needs a safe next-action boundary after the student reads that feedback. Without a reviewed learning-action source, the UI could show a button that cannot be validated by `POST /v1/student-app/ai-tutor-requests`, or an async worker could later lose the original safe feedback context.

This remains a whole-system refactor slice. It serves the immutable root requirement for Student App AI tutor and personalized question-bank workflows while preserving the Agent Harness rule that student actions must be contract-bound, reconstructable, and safe for asynchronous worker execution.

## Scope

Add `GET /v1/student-app/question-bank-draft-answer-submissions/{submissionId}/ai-feedback/learning-actions`.

The slice:

- reuses the 0369 safe feedback renderer before producing actions;
- returns only action affordances targeting `POST /v1/student-app/ai-tutor-requests`;
- adds `QUESTION_BANK_DRAFT_ANSWER_FEEDBACK` as a first-class `learningActionSource`;
- makes `CreateStudentAppAITutorRequest.Execute` rebuild the feedback snapshot, submission, render envelope, and learning actions before admitting the queue request;
- makes worker study-packet input rebuild the same safe feedback render from `feedbackArchiveItemId + studentId`;
- does not call a model, OCR, RAG, Swarm, object storage, raw SQL from JavaScript, or any raw answer source.

## Contracts

- OpenAPI path: `contracts/openapi/teaching-archive.student-app-question-bank-draft-answer-submission-ai-feedback-learning-actions.path.yaml`
- Shared source schema: `contracts/openapi/teaching-archive.student-app-ai-tutor-learning-action-source.schema.yaml`
- Go use case: `ReadStudentAppQuestionBankDraftAnswerFeedbackLearningActions.Execute`
- Domain builder: `BuildQuestionBankDraftAnswerFeedbackLearningActions`
- Worker input source: `QUESTION_BANK_DRAFT_ANSWER_FEEDBACK`

The response and source validation must not include:

- submitted answer text;
- answer keys, expected answers, explanations;
- `contentRef`, `resultRef`, raw model output, prompts, worker/claim internals;
- rendered blocks in the learning-actions response;
- database row internals, OCR/RAG chunks, Swarm/tool metadata.

## Acceptance Criteria

- Domain tests prove safe rendered feedback produces AI tutor and personalized question-bank actions.
- Domain tests prove `QUESTION_BANK_DRAFT_ANSWER_FEEDBACK` source normalization requires `submissionId`, `feedbackStatus`, and `feedbackRenderFormat`.
- Use case tests prove learning actions reuse the safe renderer.
- Queue-admission tests prove `CreateStudentAppAITutorRequest` rebuilds feedback evidence and rejects tampered `submissionId`.
- Worker input tests prove async execution rebuilds `SAFE_TEXT_BLOCKS` from the feedback archive row and does not read published packet or result archive sources.
- HTTP tests prove the Student App learning-actions endpoint and worker input response expose safe metadata only.
- `npm run verify:structure`, targeted Go tests, and `npm run quality` pass.

## Performance Boundary

This slice adds a validated product-action read and a queue-admission source check. It does not change Docker/WSL worker count, PgBouncer configuration, connection pools, or the production10k performance profile. The full-system performance claim remains the existing production10k evidence: 22,435.1 read/write RPS, P99 44.44ms, 0 errors.

## Rollback

Remove the 0370 OpenAPI path, `QUESTION_BANK_DRAFT_ANSWER_FEEDBACK` source schema additions, domain/usecase/http/worker additions and tests, the snapshot-by-feedback-archive lookup, ServerConfig/main wiring, and the 0370 row from the root trace and architecture board.
