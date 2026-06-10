# SDD 0356: Student App AI Tutor Request Progress Primary Action

## Problem

SDD 0355 made one Student App AI Tutor request safely readable, but the mobile client still had to infer what button to show from `nextStudentAction`. That inference would duplicate server rules and can drift from the actual safe endpoints.

## Scope

This slice consumes READY SDD 0355 evidence and adds a first-class `primaryAction` contract to the safe Student App AI Tutor request progress response.

- runtime id: `student_app_ai_tutor_request_progress_primary_action`
- report: `reports/student-app-ai-tutor-request-progress-primary-action.current.json`
- status: `STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_PRIMARY_ACTION_VERIFIED`

## Contracts

1. Keep the existing list and single-request progress read paths.
2. Add `primaryAction` to `StudentAppAITutorRequestProgressResponse`.
3. For `RESULT_READY`, expose an available read action to `GET /v1/student-app/archive-items/{archiveItemId}/ai-tutor-result/rendered`.
4. For `QUESTION_BANK_READY`, expose an available read action to `GET /v1/student-app/question-bank-draft-content` with the normalized safe `questionBankDraftRef`.
5. For waiting states, return a waiting action without endpoint or method.
6. For failed or unsafe continuation states, return a teacher-review action without endpoint or method.
7. Keep `resultRef`, `claimedByWorkerId`, `errorMessage`, `requestedByPrincipalId`, `sourceArchiveStudentId`, internal lineage ids, model output, OCR/RAG, Swarm, direct JavaScript database access, and new writes out of the Student App response.

## Safety Invariants

- The primary action is built in the domain progress card, not inferred by the HTTP adapter.
- The HTTP presenter only serializes the domain action.
- OpenAPI documents the action as part of the safe progress response.
- This slice remains read-only and does not add model, OCR/RAG, training, or worker dependencies to the baseline runtime.

## Acceptance Criteria

- `node tools/student-app-ai-tutor-request-progress-primary-action-audit.mjs`
- Go domain and HTTP tests cover result-ready, question-bank-ready, waiting/teacher-review action states, and forbidden-field non-leakage.
- OpenAPI includes `StudentAppAITutorRequestProgressAction`.
- `npm run verify:structure`, `npm run test:tools`, and `npm run quality` include this slice.

## Rollback

Remove this SDD, the 0356 audit/test/report, the `primaryAction` response field, the domain action builder, the OpenAPI action schema, and the 0356 hook entries from package scripts, quality gate, root workflow coverage, structure verification, root trace, and architecture board. SDD 0355 progress detail remains intact, but the Student App must not claim server-driven primary action support.
