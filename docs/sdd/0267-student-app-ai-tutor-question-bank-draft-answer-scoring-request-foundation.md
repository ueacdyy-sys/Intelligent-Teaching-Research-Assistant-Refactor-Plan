# SDD 0267 - Student App AI Tutor Question-Bank Draft Answer Scoring Request Foundation

## Problem

SDD 0266 lets a student submit answers for their own question-bank draft, but
the submitted attempt still cannot enter the AI grading control plane. Without a
reviewed queue request, the worker side cannot later know which submitted answer
is allowed to be scored.

## Scope

Add a metadata-only, own-student scoring request path for submitted
question-bank draft answers:

- domain input:
  `CreateStudentAppQuestionBankDraftAnswerScoringRequestInput`
- use case:
  `CreateStudentAppQuestionBankDraftAnswerScoringRequest.Execute`
- repository reads:
  `ArchiveRepository.GetQuestionBankDraftAnswerSubmissionForStudent` and
  `ArchiveRepository.GetQuestionBankDraftContentForStudent`
- queue write:
  `ArchiveRepository.CreateAIGradingRequest`
- HTTP endpoint:
  `POST /v1/student-app/question-bank-draft-answer-submissions/{submissionId}/ai-grading-requests`
- OpenAPI path:
  `contracts/openapi/teaching-archive.student-app-question-bank-draft-answer-submission-ai-grading-requests.path.yaml`
- worker claim metadata:
  `sourceQuestionBankDraftRef` and `sourceQuestionBankAnswerSubmissionId`

The path must require `STUDENT + STUDENT_APP + STUDENT_OWN_READ +
STUDENT_OWN_WRITE + OWN`, must read the submission by both `submissionId` and
`studentID`, must read draft content by both `draftRef` and `studentID`, and
must validate the submission-content linkage before queueing.

This slice reuses the existing `AIGradingRequest` queue. It does not create a
new scoring queue table, run model inference, generate feedback, expose answer
text, expose expected answers, expose explanations, publish student-visible
results, or return score/result metadata from the creation endpoint.

## Contracts

- Domain:
  `services/teaching-archive-gateway/internal/domain/question_bank_draft_answer_scoring_request.go`
- Use case:
  `services/teaching-archive-gateway/internal/usecase/create_student_app_question_bank_draft_answer_scoring_request.go`
- PostgreSQL queue:
  `services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_grading_request.go`
- PostgreSQL submission lookup:
  `services/teaching-archive-gateway/internal/adapter/postgres/repository_question_bank_draft_answer_submission.go`
- HTTP adapter:
  `services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_draft_answer_submission.go`
- Audit:
  `tools/student-app-ai-tutor-question-bank-draft-answer-scoring-request-audit.mjs`
- Report:
  `reports/student-app-ai-tutor-question-bank-draft-answer-scoring-request.current.json`

## Acceptance Criteria

- Domain tests cover own-student normalization, teacher/remote rejection,
  cross-student source rejection, and question-bank source eligibility for the
  existing `AIGradingRequest` queue.
- Use case tests prove forbidden principals do not hit the repository, missing
  submissions return `ErrNotFound`, broken submission/content linkage is
  rejected, and successful requests call `CreateAIGradingRequest` exactly once.
- PostgreSQL tests prove answer submissions are looked up by
  `(submissionId, studentID)`, and existing AI grading request persistence,
  query, result, and worker claim paths retain the question-bank source refs.
- HTTP tests prove the Student App can queue a request for its own submitted
  answer, teacher/cross-student/remote principals are rejected, unsupported
  subresources are not found, and the response omits answer text, expected
  answers, explanations, scores, score summaries, model results, and feedback.
- Worker claim tests prove internal workers can receive
  `sourceQuestionBankDraftRef` and `sourceQuestionBankAnswerSubmissionId`
  without answer/key/feedback leakage.
- Strict quality includes the answer scoring request foundation audit.
- Root workflow coverage requires
  `studentAppAiTutorQuestionBankDraftAnswerScoringRequest`.
- The architecture board marks 10.7/10 as a queued scoring request foundation,
  not a full AI Tutor completion claim.

## Rollback

Remove the scoring request domain, use case, HTTP subresource, OpenAPI path,
question-bank source refs from AI grading request persistence/query/claim/result
contracts, audit/report, root coverage hook, quality hook, structure verifier
entries, and architecture board 10.7 text. Keep SDD 0266 as the answer
submission foundation.
