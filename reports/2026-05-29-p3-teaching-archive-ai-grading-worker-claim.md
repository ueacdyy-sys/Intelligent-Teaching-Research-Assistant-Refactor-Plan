# P3 Teaching Archive AI Grading Worker Claim

## Slice

- SDD: `docs/sdd/0040-teaching-archive-ai-grading-worker-claim.md`
- Endpoint: `POST /v1/teaching/ai-grading-requests/worker-claims`
- Scope: metadata-only AI grading worker intake and lease claim.

## Requirement Trace

- Root requirement: AI grading remains in Teaching Mode, with OCR or handwriting recognition reserved for precise scoring.
- Root requirement: student archive data can be tracked and later analyzed.
- Whole-system map: AI Workers stay behind a Job API and do not directly poll/write the main database.
- SDD 0038: AI grading request intake queues metadata-only `QUEUED` jobs.
- SDD 0039: AI grading query view exposes request status.

## Red Evidence

Before implementation, `go test ./services/teaching-archive-gateway/...` failed as expected:

- `undefined: domain.ApplyAIGradingClaim`
- `undefined: domain.ClaimAIGradingRequestInput`
- `undefined: domain.AIGradingStatusInProgress`
- `repository.ClaimNextAIGradingRequest undefined`
- `undefined: usecase.NewClaimAIGradingRequest`

## Implementation

- Added `ClaimAIGradingRequestInput`, `ApplyAIGradingClaim`, bounded lease normalization, and service-principal authorization.
- Added `IN_PROGRESS` status and claim metadata fields on AI grading requests.
- Added `ClaimAIGradingRequest` use case with repository claim port.
- Added `POST /v1/teaching/ai-grading-requests/worker-claims`.
- Added PostgreSQL atomic claim with `UPDATE ... FOR UPDATE SKIP LOCKED ... RETURNING`.
- Added nullable lease metadata columns and claim-eligible index to `teaching_ai_grading_requests`.
- Kept OpenAPI worker-claim path in a split path file to keep `teaching-archive.yaml` below the strict file-size threshold.

## Verification

- `go test ./services/teaching-archive-gateway/...`: PASS
- `npm run verify:structure`: PASS
- `npm test`: PASS
- `npm run quality`: PASS

## Performance And Dependency Notes

- Claim path touches one eligible row and uses `FOR UPDATE SKIP LOCKED` to support concurrent workers.
- Claim selection is ordered by oldest eligible work to prevent starvation.
- No OCR, RAG, model, training, scoring, or Python worker dependency was added.
- Largest touched source/contract files remain under 800 lines after this slice:
  - `contracts/openapi/teaching-archive.yaml`: 797 lines
  - `server.go`: 740 lines
  - `server_test.go`: 799 lines
  - `repository.go`: 769 lines

## Rollback

Remove SDD 0040, the AI grading worker claim route, claim domain/use-case files, PostgreSQL claim file/columns/indexes, OpenAPI worker-claims path ref file, tests, and structure verifier entries. SDD 0038 intake and SDD 0039 query view can remain.
