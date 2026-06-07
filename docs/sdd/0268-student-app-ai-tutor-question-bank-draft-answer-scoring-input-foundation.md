# SDD 0268 - Student App AI Tutor Question-Bank Draft Answer Scoring Input Foundation

## Problem

SDD 0267 can queue an AI grading request for a student's submitted
question-bank draft answer, and the worker claim can receive source refs. The
worker still needs a reviewed internal path to resolve those refs into the
actual scoring input package: submitted answer text, expected answer, and
explanation.

Without this slice, later scoring would either duplicate lookup rules in worker
code or risk exposing answer keys through student-facing endpoints.

## Scope

Add a worker-only scoring input read path for already claimed question-bank
draft answer AI grading requests:

- domain input:
  `ReadQuestionBankDraftAnswerScoringInputInput`
- domain builder:
  `BuildQuestionBankDraftAnswerScoringInput`
- use case:
  `ReadQuestionBankDraftAnswerScoringInput.Execute`
- repository reads:
  `GetAIGradingRequestByID`,
  `GetQuestionBankDraftAnswerSubmissionForStudent`, and
  `GetQuestionBankDraftContentForStudent`
- HTTP endpoint:
  `POST /v1/teaching/ai-grading-requests/{requestId}/question-bank-answer-scoring-input`
- OpenAPI path:
  `contracts/openapi/teaching-archive.ai-grading-question-bank-answer-scoring-input.path.yaml`

The endpoint must require an internal service principal with
`SERVICE + AGENT_INTERNAL + TEACHING_WRITE`, the request must already be
`IN_PROGRESS`, it must be claimed by the same `workerId`, and the claim lease
must be unexpired. The source must be a question-bank draft answer source, and
the request, submitted answer, draft content, student id, archive item,
material, tutoring analysis request, and answer item ids must all link together.

This slice intentionally exposes `answerText`, `expectedAnswer`, and
`explanation` only to the internal worker input endpoint. It does not run model
inference, calculate scores, persist results, generate feedback, publish
student-visible content, or expose answer keys through Student App endpoints.

## Contracts

- Domain:
  `services/teaching-archive-gateway/internal/domain/question_bank_draft_answer_scoring_input.go`
- Use case:
  `services/teaching-archive-gateway/internal/usecase/read_question_bank_draft_answer_scoring_input.go`
- HTTP adapter:
  `services/teaching-archive-gateway/internal/adapter/httpapi/server_ai_grading_claim.go`
- OpenAPI path:
  `contracts/openapi/teaching-archive.ai-grading-question-bank-answer-scoring-input.path.yaml`
- Audit:
  `tools/student-app-ai-tutor-question-bank-draft-answer-scoring-input-audit.mjs`
- Report:
  `reports/student-app-ai-tutor-question-bank-draft-answer-scoring-input.current.json`

## Acceptance Criteria

- Domain tests prove non-service principals are rejected, expired leases and
  wrong workers return conflicts, non-question-bank sources are rejected, broken
  linkage is rejected, and the worker-only answer package includes submitted
  answer text plus expected answer and explanation.
- Use case tests prove forbidden principals do not hit the repository, missing
  requests/submissions/content return `ErrNotFound`, wrong workers are rejected
  before source reads, and successful reads return the worker input package.
- HTTP tests prove the internal endpoint returns answer input only for service
  workers, rejects teacher principals, rejects wrong workers, and does not
  include scoring result, feedback, or publication fields.
- OpenAPI documents the endpoint under `/v1/teaching`, not under Student App,
  with `AgentApiKey` and `PrincipalContextHeader` security.
- Strict quality includes the answer scoring input foundation audit.
- Root workflow coverage requires
  `studentAppAiTutorQuestionBankDraftAnswerScoringInput`.
- The architecture board marks 10.8/10 as a worker-only scoring input
  foundation, not a completed AI grading or AI Tutor product claim.

## Rollback

Remove the scoring input domain, use case, HTTP subresource, OpenAPI path,
audit/report, root coverage hook, quality hook, structure verifier entries, and
architecture board 10.8 text. Keep SDD 0267 as the queued scoring request
foundation and keep worker result/scoring/publication as later reviewed slices.
