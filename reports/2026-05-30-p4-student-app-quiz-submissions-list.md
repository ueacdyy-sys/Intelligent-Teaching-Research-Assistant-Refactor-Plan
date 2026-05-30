# P4 Student App Quiz Submissions List

## Slice

- SDD: `docs/sdd/0064-student-app-quiz-submissions-list.md`
- Root requirement anchor: Student App includes account login, AI tutor, student archive, teaching materials, personalized question bank, and scan-to-answer.
- Existing refactor evidence: Student App can create scan-answer quiz submissions and existing Teaching Archive query persistence stores quiz submission metadata.

## Contract

- Added `GET /v1/student-app/quiz-submissions`.
- Requires Agent API key plus Principal Context.
- Requires a Student App principal with `STUDENT_OWN_READ` and own-student access mode.
- Accepts optional `quizArchiveItemId`, `pageSize`, and `cursor`.
- Forces `studentId` to the authenticated student's own ID.
- Returns metadata-only quiz submissions: `answerRef`, ids, status, and `submittedAt`.

## Red Evidence

`npm run verify:structure` failed before implementation with the expected missing files:

- `services/teaching-archive-gateway/internal/domain/student_app_quiz_submissions.go`
- `services/teaching-archive-gateway/internal/usecase/list_student_app_quiz_submissions.go`
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_quiz_submissions.go`

`go test ./services/teaching-archive-gateway/...` failed before implementation on undefined Student App quiz submission list symbols:

- `domain.NormalizeListStudentAppQuizSubmissionsInput`
- `domain.ListStudentAppQuizSubmissionsInput`
- `usecase.NewListStudentAppQuizSubmissions`
- `httpapi.ServerConfig.ListStudentAppQuizSubmissions`

## Green Evidence

- `go test ./services/teaching-archive-gateway/...`: PASS
- `npm run verify:structure`: PASS
- `npm test`: PASS
- `npm run quality`: PASS, 15.1s
- `services/agent-harness/target` cleanup check: `False`

Latest `reports/quality-gate.current.json`:

- allPassed: `true`
- elapsedMs: `12471`
- npm test: PASS, 6765ms
- go vet: PASS, 1434ms
- cargo test: PASS, 756ms
- identity session runtime audit: PASS
- identity access contract audit: PASS
- direct-limited connection budget: PASS
- pgbouncer connection budget: PASS

## Design Notes

- This is a Student App contract, not a new storage model.
- The endpoint hides the desktop nested teaching archive URL shape from mobile clients.
- Teacher desktop, remote social, service, and missing-`STUDENT_OWN_READ` principals are rejected before repository access.
- PostgreSQL reuses `teaching_quiz_submissions` and can now query by `student_id` without a fake empty `quiz_archive_item_id` predicate.
- The repository rejects cursor-only queries before SQL execution to prevent unscoped scans.
- No SQL table, package manifest, OCR/RAG/model, or training dependency was added.
