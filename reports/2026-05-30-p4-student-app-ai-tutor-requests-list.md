# P4 Student App AI Tutor Requests List

## Slice

- SDD: `docs/sdd/0063-student-app-ai-tutor-requests-list.md`
- Root requirement anchor: Student App includes account login, AI tutor, student archive, teaching materials, personalized question bank, and scan-to-answer.
- Existing refactor evidence: Student App can list own archive items and queue AI tutor jobs; Teaching Archive already owns tutoring-analysis query pagination.

## Contract

- Added `GET /v1/student-app/ai-tutor-requests`.
- Kept existing `POST /v1/student-app/ai-tutor-requests`.
- Requires Agent API key plus Principal Context.
- Requires a Student App principal with `STUDENT_OWN_READ` and own-student access mode.
- Accepts optional `status`, `pageSize`, and `cursor`.
- Forces `sourceArchiveOwnerType=STUDENT` and `studentId` to the authenticated student's own ID.
- Reuses existing `TutoringAnalysisRequestListResponse`.

## Red Evidence

`npm run verify:structure` failed before implementation with the expected missing files:

- `services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_requests.go`
- `services/teaching-archive-gateway/internal/usecase/list_student_app_ai_tutor_requests.go`
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_requests.go`

`go test ./services/teaching-archive-gateway/...` failed before implementation on undefined Student App AI tutor list symbols:

- `domain.NormalizeListStudentAppAITutorRequestsInput`
- `domain.ListStudentAppAITutorRequestsInput`
- `usecase.NewListStudentAppAITutorRequests`
- `httpapi.ServerConfig.ListStudentAppAITutorRequests`

## Green Evidence

- `go test ./services/teaching-archive-gateway/...`: PASS
- `npm run verify:structure`: PASS
- `npm test`: PASS, 41.7s
- `npm run quality`: PASS, 49.2s
- `services/agent-harness/target` cleanup check: `False`

Latest `reports/quality-gate.current.json`:

- allPassed: `true`
- elapsedMs: `46543`
- npm test: PASS, 40424ms
- go vet: PASS, 1621ms
- cargo test: PASS, 744ms
- identity session runtime audit: PASS
- identity access contract audit: PASS
- direct-limited connection budget: PASS
- pgbouncer connection budget: PASS

## Design Notes

- This is a Student App contract, not a new storage model.
- The endpoint hides desktop tutoring-analysis filters from mobile clients and derives the student scope from Principal Context.
- Teacher desktop, remote social, service, and missing-`STUDENT_OWN_READ` principals are rejected before repository access.
- The existing Student App AI tutor POST route remains available on the same path.
- PostgreSQL uses the existing tutoring-analysis request `List` query; no new table, index, migration, or persistence method was added.
- No package manifest changed.
- No OCR/RAG/model/training dependency was added.
