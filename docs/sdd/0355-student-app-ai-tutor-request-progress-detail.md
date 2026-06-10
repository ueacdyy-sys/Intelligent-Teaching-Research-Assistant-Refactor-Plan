# SDD 0355: Student App AI Tutor Request Progress Detail

## Problem

SDD 0354 made the Student App AI Tutor request list safe for mobile progress UI, but the product still could not open a single request from that list. A student needs a safe detail read for one request without falling back to the generic tutoring-request response or leaking internal worker/storage fields.

## Scope

This slice consumes READY SDD 0354 evidence and adds only the Student App single-request progress read contract.

- runtime id: `student_app_ai_tutor_request_progress_detail`
- report: `reports/student-app-ai-tutor-request-progress-detail.current.json`
- status: `STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_DETAIL_VERIFIED`

## Contracts

1. Add `GET /v1/student-app/ai-tutor-requests/{requestId}`.
2. Normalize `requestId` with the existing tutoring request id rules.
3. Scope the read by Student App principal, `sourceArchiveOwnerType=STUDENT`, and the authenticated student's own id before repository access.
4. Return the same `StudentAppAITutorRequestProgressResponse` used by the safe list contract.
5. Return not found for missing or cross-student requests without revealing whether another student's request exists.
6. Keep `resultRef`, `claimedByWorkerId`, `errorMessage`, `requestedByPrincipalId`, `sourceArchiveStudentId`, internal lineage ids, model output, OCR/RAG, Swarm, direct JavaScript database access, and new writes out of the path.

## Safety Invariants

- The detail use case queries through the scoped tutoring-request reader instead of direct raw row lookup.
- The HTTP response is built from `BuildStudentAppAITutorRequestProgressCard`.
- OpenAPI documents the same safe progress response as the list endpoint.
- The slice is read-only and does not add model, OCR/RAG, training, or worker dependencies to the baseline runtime.

## Acceptance Criteria

- `node tools/student-app-ai-tutor-request-progress-detail-audit.mjs`
- Go domain, use case, and HTTP tests cover own read, cross-student not found, and forbidden-field non-leakage.
- OpenAPI includes `/v1/student-app/ai-tutor-requests/{requestId}`.
- `npm run verify:structure`, `npm run test:tools`, and `npm run quality` include this slice.

## Rollback

Remove this SDD, the 0355 audit/test/report, the detail use case, the Student App AI Tutor request subroute/parser/handler, the OpenAPI path, and the 0355 hook entries from package scripts, quality gate, root workflow coverage, structure verification, root trace, and architecture board. SDD 0354 list progress remains intact, but the Student App must not claim single-request progress detail support.
