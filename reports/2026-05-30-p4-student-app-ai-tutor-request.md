# P4 Student App AI Tutor Request

## Slice

- SDD: `docs/sdd/0061-student-app-ai-tutor-request.md`
- Root requirement anchor: Student App includes account login, AI tutor, student archive, teaching materials, personalized question bank, and scan-to-answer.
- Existing refactor evidence: Teaching Archive already owns tutoring-analysis request persistence, worker claim, and worker result APIs.

## Contract

- Added `POST /v1/student-app/ai-tutor-requests`.
- Requires Agent API key plus Principal Context.
- Requires a Student App principal with `TEACHING_READ`, `STUDENT_OWN_READ`, and own-student access mode.
- Accepts bounded `studentArchiveItemId`, `analysisGoal`, and optional `questionBankIntent`.
- Defaults `questionBankIntent` to `GENERATE_PERSONALIZED_CHECK`.
- Queues the existing tutoring-analysis request shape and returns the stable `TutoringAnalysisRequestResponse`.

## Red Evidence

`npm run verify:structure` failed before implementation with the expected missing files:

- `contracts/openapi/teaching-archive.student-app-ai-tutor-requests.path.yaml`
- `services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_request.go`
- `services/teaching-archive-gateway/internal/usecase/create_student_app_ai_tutor_request.go`
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_request.go`

`go test ./services/teaching-archive-gateway/...` failed before implementation on undefined Student App AI tutor symbols:

- `domain.NormalizeCreateStudentAppAITutorRequestInput`
- `domain.CreateStudentAppAITutorRequestInput`
- `usecase.NewCreateStudentAppAITutorRequest`
- `httpapi.ServerConfig.CreateStudentAppAITutorRequest`

## Green Evidence

- `go test ./services/teaching-archive-gateway/...`: PASS
- `npm run verify:structure`: PASS
- `npm test`: PASS, 40.5s
- `npm run quality`: PASS, 47.3s
- `services/agent-harness/target` cleanup check: `False`

Latest `reports/quality-gate.current.json`:

- allPassed: `true`
- elapsedMs: `44869`
- npm test: PASS, 38943ms
- go vet: PASS, 1676ms
- cargo test: PASS, 783ms
- identity session runtime audit: PASS
- identity access contract audit: PASS
- direct-limited connection budget: PASS
- pgbouncer connection budget: PASS

## Design Notes

- This is a Student App contract, not a new AI runtime or storage model.
- The endpoint reuses existing tutoring-analysis persistence and worker handoff APIs.
- The domain boundary normalizes only Student App request fields; source archive metadata is populated only after the use case fetches the archive item.
- Teacher desktop, remote social, service, missing-scope, teaching-owned, and other-student archive access are rejected before persistence writes.
- PostgreSQL uses the existing tutoring-analysis request persistence; no new table, index, migration, or repository method was added.
- No package manifest changed.
- No OCR/RAG/model/training dependency was added.
