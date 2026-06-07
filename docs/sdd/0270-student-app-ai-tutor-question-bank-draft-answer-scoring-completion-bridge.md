# SDD 0270 - Student App AI Tutor Question-Bank Draft Answer Scoring Completion Bridge

## Problem

SDD 0267 queues a student's question-bank draft answer for AI grading, SDD 0268
lets the internal worker read the protected answer/key package, and SDD 0269
lets the student read a safe status/result summary. The remaining risk is a
boundary gap: the system must prove that question-bank answer scoring completion
reuses the existing `RecordAIGradingResult` worker-result path instead of
creating a duplicate result API or exposing worker internals to Student App.

Without this bridge, the architecture can look complete while the actual
request lifecycle is only validated in separate slices.

## Scope

Add an auditable completion bridge for the existing runtime chain:

- worker input:
  `POST /v1/teaching/ai-grading-requests/{requestId}/question-bank-answer-scoring-input`
- existing worker result:
  `POST /v1/teaching/ai-grading-requests/{requestId}/worker-result`
- student safe read:
  `GET /v1/student-app/question-bank-draft-answer-submissions/{submissionId}/ai-grading-result`

The bridge must prove that a question-bank answer scoring request can:

- expose `answerText`, `expectedAnswer`, and `explanation` only to the internal
  worker input endpoint;
- reuse `RecordAIGradingResult.Execute` and
  `ArchiveRepository.RecordAIGradingResult` for completion;
- let the owning student read only `status`, successful `scoreSummary`,
  failed `errorCode`, and timestamps through the Student App result endpoint;
- keep `resultRef`, worker ids, claim leases, raw model output, detailed
  feedback, and internal failure details out of the Student App response.

This slice intentionally does not add a new OpenAPI path, new database table,
new queue, model inference runtime, detailed feedback schema, or publication
flow.

## Contracts

- HTTP bridge test:
  `services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_draft_answer_scoring_completion_test.go`
- Worker input:
  `services/teaching-archive-gateway/internal/usecase/read_question_bank_draft_answer_scoring_input.go`
- Worker result:
  `services/teaching-archive-gateway/internal/usecase/record_ai_grading_result.go`
- Student result:
  `services/teaching-archive-gateway/internal/usecase/read_student_app_question_bank_draft_answer_scoring_result.go`
- Audit:
  `tools/student-app-ai-tutor-question-bank-draft-answer-scoring-completion-bridge-audit.mjs`
- Report:
  `reports/student-app-ai-tutor-question-bank-draft-answer-scoring-completion-bridge.current.json`

## Acceptance Criteria

- HTTP test proves one request can move through worker scoring input, existing
  worker-result completion, and Student App safe result read.
- The worker input response includes the protected answer/key package.
- The worker-result response can include internal completion metadata such as
  `resultRef` because it is internal service-only.
- The Student App response never includes answer text, expected answer,
  explanation, result refs, internal error messages, worker ids, claim leases,
  raw model output, detailed feedback, or publication fields.
- Audit proves the bridge reuses the existing worker-result path instead of
  adding a duplicate question-bank scoring result endpoint.
- Strict quality includes the completion bridge audit.
- Root workflow coverage requires
  `studentAppAiTutorQuestionBankDraftAnswerScoringCompletionBridge`.
- The architecture board marks 10.10/10 as a completion bridge, not completed
  model inference, feedback generation, or publication.

## Performance

This slice does not change the production hot path shape or add broad
`production10k` evidence. Current whole-system evidence remains
`22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`; this supports the 10k RPS
/ 50ms class, while 10ms remains an optimization target for future hot-path
work.

## Rollback

Remove the bridge test, audit/report, root coverage hook, quality hook,
structure verifier entries, SDD 0270, and architecture board 10.10 text. Keep
SDD 0267, 0268, and 0269 intact because queued scoring, worker input, and
student safe result read remain valid independent slices.
