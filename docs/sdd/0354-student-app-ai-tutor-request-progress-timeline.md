# SDD 0354: Student App AI Tutor Request Progress Timeline

## Problem

Student App users can list AI Tutor requests, but the old response shape exposes generic tutoring-request internals such as requester ids, source student ids, result refs, error messages, and worker details. That is not a safe mobile product contract and it does not give the student a clear progress timeline.

The system needs a student-visible progress card that explains where an AI Tutor request is in the queue/review/delivery lifecycle without leaking internal worker, storage, lineage, or error details.

## Scope

This slice consumes READY SDD 0353 evidence and changes only the Student App AI Tutor request list read contract.

- runtime id: `student_app_ai_tutor_request_progress_timeline`
- report: `reports/student-app-ai-tutor-request-progress-timeline.current.json`
- status: `STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_TIMELINE_VERIFIED`

## Contracts

1. Require READY 0353 follow-up lineage evidence.
2. Add a domain progress-card builder for student-owned tutoring requests.
3. Map request states to safe progress stages and next student actions.
4. Return a fixed student-visible timeline for request queued, AI Tutor working, reviewed result, and student delivery.
5. Keep `resultRef`, `claimedByWorkerId`, `errorMessage`, `requestedByPrincipalId`, and `sourceArchiveStudentId` out of the Student App list response.
6. Keep the slice read-only: no new tables, no new writes, no model inference, no OCR/RAG, no Swarm, and no direct JavaScript database access.

## Safety Invariants

- A teaching-owned tutoring request is rejected by the student progress-card builder.
- Student App progress messages are controlled strings, not raw provider or worker errors.
- Follow-up provenance is represented only by safe fields already approved for Student App use.
- The mobile app receives enough progress state to render waiting/result/review actions without internal storage refs.

## Acceptance Criteria

- `node tools/student-app-ai-tutor-request-progress-timeline-audit.mjs`
- Go domain and HTTP tests prove safe progress mapping and forbidden-field non-leakage.
- OpenAPI documents `StudentAppAITutorRequestProgressListResponse`.
- `npm run verify:structure`, `npm run test:tools`, and `npm run quality` include this slice.

## Rollback

Remove this SDD, the 0354 audit/test/report, the progress-card domain builder, the Student App progress response/presenter change, the OpenAPI progress schemas, and the 0354 hook entries from package scripts, quality gate, root workflow coverage, structure verification, root trace, and architecture board. SDD 0353 lineage remains intact, but the Student App AI Tutor request list would fall back to the old generic request response and must not be considered safe for mobile progress UI.
