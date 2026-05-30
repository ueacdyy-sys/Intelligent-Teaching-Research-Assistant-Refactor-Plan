# P3 Teaching Quiz Scan Submission

## Slice

- SDD: `docs/sdd/0058-teaching-quiz-scan-submission.md`
- Root requirement anchor: Student App includes teaching materials, student answer resources, personalized question bank, and scan-to-answer.
- Existing refactor evidence: SDD 0045-0048 already own quiz submission intake/query and quiz-submission AI grading handoff.

## Contract

- Added `POST /v1/teaching/quiz-scan-submissions`.
- Requires Agent API key plus Principal Context.
- Requires a Student App principal with own-student write access.
- Accepts a bounded QR payload string: `teaching-quiz:{archiveItemId}`.
- Resolves the payload to an existing teaching-owned `QUIZ` archive item.
- Creates the existing metadata-only quiz submission shape.

## Red Evidence

`npm run verify:structure` failed before implementation with the expected missing files:

- `services/teaching-archive-gateway/internal/domain/quiz_scan_submission.go`
- `services/teaching-archive-gateway/internal/usecase/create_scanned_quiz_submission.go`
- `services/teaching-archive-gateway/internal/adapter/httpapi/server_quiz_scan_submission.go`

`go test ./services/teaching-archive-gateway/...` failed before implementation on undefined scan-submission symbols:

- `domain.ResolveQuizScanCode`
- `domain.NormalizeCreateScannedQuizSubmissionInput`
- `domain.CreateScannedQuizSubmissionInput`
- `usecase.NewCreateScannedQuizSubmission`

## Green Evidence

- `go test ./services/teaching-archive-gateway/...`: PASS
- `npm run verify:structure`: PASS
- `npm test`: PASS
- `npm run quality`: PASS

Latest `reports/quality-gate.current.json`:

- allPassed: `true`
- npm test: PASS, 70302ms
- go vet: PASS, 64793ms
- cargo test: PASS, 748ms
- identity session runtime audit: PASS
- identity access contract audit: PASS
- direct-limited connection budget: PASS
- pgbouncer connection budget: PASS

## Design Notes

- The QR payload is a locator, not an auth token; Principal Context remains the security boundary.
- The domain layer owns scan-code normalization and the Student App own-student gate.
- The use case resolves the quiz archive item, reuses existing quiz-submission authorization, and stores only metadata.
- The HTTP adapter only translates request/response shape.
- No PostgreSQL schema or new persistence method was needed; the existing `CreateQuizSubmission` repository method is reused.
- No OCR/RAG/model/training dependency was added.
- No package manifest changed.
