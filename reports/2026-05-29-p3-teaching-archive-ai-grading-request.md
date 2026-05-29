# P3 Teaching Archive AI Grading Request Intake

Date: 2026-05-29
Slice: SDD 0038
Branch: codex/sdd-tdd-refactor

## Root Requirement Trace

- AI grading remains a Teaching Mode capability.
- OCR or handwriting recognition is reserved for later accurate scoring.
- Student archive material includes quizzes, papers, handouts, homework, and other learning materials.
- AI/OCR/model execution remains worker-side and is not added to the baseline runtime.

## Red Evidence

Before implementation, `go test ./services/teaching-archive-gateway/...` failed because the AI grading request boundary did not exist. Representative evidence:

- HTTP test returned `404` for `/v1/teaching/archive-items/{archiveItemId}/ai-grading-requests`.
- Domain build failed with missing `domain.NewAIGradingRequest`, `domain.CreateAIGradingRequestInput`, and `domain.AIGradingStatusQueued`.
- Use-case build failed with missing `usecase.NewCreateAIGradingRequest`.
- PostgreSQL adapter build failed with missing `CreateAIGradingRequest` and `domain.AIGradingRequest`.

## Implementation

- Added SDD 0038 for metadata-only AI grading request intake.
- Added `POST /v1/teaching/archive-items/{archiveItemId}/ai-grading-requests`.
- Added `AIGradingRequest` domain model with `QUEUED` status.
- Required `gradingInstructions`; accepted optional `rubricRef`.
- Required the source archive item to be a student quiz, paper, or homework item with `AI_GRADING` intent.
- Required teacher/student write authorization through archive ownership rules.
- Added PostgreSQL table `teaching_ai_grading_requests` and metadata indexes.
- Added `AIGradingRequestIDGenerator` with `grading_req_` IDs.
- Kept OCR, handwriting recognition, score generation, model calls, and worker result writeback out of this slice.

## Verification

- `go test ./services/teaching-archive-gateway/...`: PASS
- `npm run verify:structure`: PASS
- `npm test`: PASS
- `npm run quality`: PASS

Quality gate summary from `reports/quality-gate.current.json`:

- `allPassed`: true
- `elapsedMs`: 137753
- `npm test`: PASS, 69639 ms
- `go vet`: PASS, 64170 ms
- `cargo test`: PASS, 808 ms
- `identity session runtime audit`: PASS, 654 ms
- `identity access contract audit`: PASS, 651 ms
- `direct-limited connection budget`: PASS, 673 ms
- `pgbouncer connection budget`: PASS, 702 ms

## Dependency Boundary

No package manifests or lockfiles were changed. The baseline workspace still uses Node scripts, Go services, and the Rust agent harness only. No OCR, RAG, model, or training packages were added.

## Rollback

Remove SDD 0038, the AI grading request OpenAPI path and schemas, the `teaching_ai_grading_requests` SQL table/indexes, domain/use-case/HTTP/PostgreSQL wiring, `AIGradingRequestIDGenerator`, structure verifier entries, and associated tests. SDD 0029 archive intake and the tutoring analysis request chain remain intact.
