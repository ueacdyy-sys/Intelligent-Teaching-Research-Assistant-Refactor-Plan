# SDD 0357: Student App AI Tutor Request Progress Target URL

## Problem

SDD 0356 made progress actions server-driven, but the `QUESTION_BANK_READY` action still required the mobile client to combine `targetEndpoint` and `questionBankDraftRef` into a query string. That leaves a small but real client-side rule that can drift from the OpenAPI contract.

## Scope

This slice consumes READY SDD 0356 evidence and adds a safe `targetUrl` to the Student App AI Tutor progress primary action.

- runtime id: `student_app_ai_tutor_request_progress_target_url`
- report: `reports/student-app-ai-tutor-request-progress-target-url.current.json`
- status: `STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_TARGET_URL_VERIFIED`

## Contracts

1. Keep `primaryAction.targetEndpoint` as the stable route identity.
2. Add `primaryAction.targetUrl` as the direct same-origin URL the Student App can call.
3. For result-ready actions, `targetUrl` equals the rendered result archive endpoint.
4. For question-bank-ready actions, `targetUrl` equals `/v1/student-app/question-bank-draft-content?questionBankDraftRef={encodedRef}`.
5. Encode the question-bank draft ref on the server side.
6. For waiting and teacher-review actions, do not expose `targetUrl`, endpoint, or method.
7. Keep internal refs, result refs, worker metadata, raw model output, OCR/RAG, Swarm, direct JavaScript database access, and new writes out of the path.

## Safety Invariants

- URL construction stays in the domain progress action builder.
- The HTTP presenter only serializes the domain action.
- OpenAPI constrains the URL to the two Student App read targets.
- This slice remains read-only and does not add model, OCR/RAG, training, or worker dependencies to the baseline runtime.

## Acceptance Criteria

- `node tools/student-app-ai-tutor-request-progress-target-url-audit.mjs`
- Go domain and HTTP tests cover result and question-bank `targetUrl`.
- OpenAPI includes the constrained `targetUrl` pattern.
- `npm run verify:structure`, `npm run test:tools`, and `npm run quality` include this slice.

## Rollback

Remove this SDD, the 0357 audit/test/report, the `targetUrl` response field, the domain URL construction, the OpenAPI `targetUrl` property, and the 0357 hook entries from package scripts, quality gate, root workflow coverage, structure verification, root trace, and architecture board. SDD 0356 server-driven primary actions remain intact, but the Student App must keep assembling query URLs itself.
