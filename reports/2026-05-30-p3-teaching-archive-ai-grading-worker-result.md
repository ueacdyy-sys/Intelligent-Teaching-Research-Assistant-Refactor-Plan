# P3 Teaching Archive AI Grading Worker Result

## Slice

- SDD: `docs/sdd/0044-teaching-archive-ai-grading-worker-result.md`
- Endpoint: `POST /v1/teaching/ai-grading-requests/{requestId}/worker-result`
- Scope: metadata-only AI grading worker result writeback with active lease guard.

## Requirement Trace

- Root requirement: AI grading remains in Teaching Mode, with OCR or handwriting recognition reserved for precise scoring.
- Root requirement: student archive data can be tracked and later analyzed.
- Whole-system map: AI Workers stay behind a Job API and do not directly poll/write the main database.
- SDD 0038: AI grading request intake queues metadata-only `QUEUED` jobs.
- SDD 0039: AI grading query view exposes request status.
- SDD 0040: AI grading worker claim marks active leased work as `IN_PROGRESS`.

## Red Evidence

Before implementation, `go test ./services/teaching-archive-gateway/...` and `npm run verify:structure` failed as expected:

- HTTP worker-result route returned `404 NOT_FOUND`.
- `undefined: domain.ApplyAIGradingResult`
- `undefined: domain.RecordAIGradingResultInput`
- `undefined: domain.AIGradingStatusSucceeded`
- `undefined: usecase.NewRecordAIGradingResult`
- `repository.RecordAIGradingResult undefined`
- structure verifier reported missing AI grading result OpenAPI/domain/use-case/PostgreSQL files.

## Implementation

- Added `RecordAIGradingResultInput`, `ApplyAIGradingResult`, final statuses `SUCCEEDED` and `FAILED`, score/result/error metadata, and service-principal authorization.
- Added lease-holder enforcement so only the current worker can write a result before `claimExpiresAt`.
- Added `RecordAIGradingResult` use case with read and atomic writeback repository ports.
- Added `POST /v1/teaching/ai-grading-requests/{requestId}/worker-result`.
- Added PostgreSQL result columns and lease-guarded `UPDATE` for result metadata.
- Extended AI grading query/claim scans so list and worker responses can include final metadata.
- Kept request body details in a split OpenAPI path file so `teaching-archive.yaml` remains below the strict headroom gate.

## Verification

- `go test ./services/teaching-archive-gateway/...`: PASS
- `npm run verify:structure`: PASS
- `npm test`: PASS
- `npm run quality`: PASS

## Performance And Dependency Notes

- Result writeback uses a single indexed primary-key update guarded by `status`, `claimed_by_worker_id`, and `claim_expires_at`.
- The write path does not read archive file content and does not invoke OCR, RAG, model, training, scoring, or Python worker dependencies.
- Current headroom after this slice:
  - `contracts/openapi/teaching-archive.yaml`: 684 lines
  - `server.go`: 353 lines
  - `server_test.go`: 414 lines
  - `tools/verify-structure.mjs`: 656 lines

## Rollback

Remove SDD 0044, the AI grading worker-result route, result domain/use-case/PostgreSQL files, result columns, OpenAPI worker-result path ref file, tests, and structure verifier entries. SDD 0038 intake, SDD 0039 query view, and SDD 0040 worker claim can remain.
