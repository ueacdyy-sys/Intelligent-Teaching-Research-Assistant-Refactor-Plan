# P3 Teaching Archive Tutoring Analysis Worker Claim

Date: 2026-05-29
Slice: SDD 0036
Branch: codex/sdd-tdd-refactor

## Root Requirement Trace

- Archive material can move into tutoring mode for analysis.
- Personalized tutoring can visualize student ability and analyze progress.
- Tutoring mode reserves a personalized question-bank check after tutoring.
- OCR, RAG, model execution, and model training remain worker-side concerns and are not added to the baseline runtime.

## Red Evidence

Before implementation, `go test ./services/teaching-archive-gateway/...` failed because the worker claim boundary did not exist. Representative missing symbols:

- `domain.ApplyTutoringAnalysisClaim`
- `domain.ClaimTutoringAnalysisRequestInput`
- `domain.TutoringAnalysisStatusInProgress`
- `usecase.NewClaimTutoringAnalysisRequest`

## Implementation

- Added SDD 0036 for metadata-only worker task claiming.
- Added `POST /v1/teaching/tutoring-analysis-requests/worker-claims`.
- Allowed only `SERVICE` principals from `AGENT_INTERNAL` with `TEACHING_WRITE`.
- Added `IN_PROGRESS` tutoring analysis status.
- Required `workerId` and bounded `leaseSeconds` from 30 to 3600 seconds.
- Stored `claimed_by_worker_id`, `claim_expires_at`, and `updated_at`.
- Returned `200` with worker claim metadata when a request is claimed.
- Returned `204` when no eligible request is available.
- Kept OCR/RAG/model execution, generated questions, and training dependencies out of this slice.

## Concurrency And Recovery

- PostgreSQL claim uses one atomic `UPDATE ... SELECT ... FOR UPDATE SKIP LOCKED ... RETURNING` shape.
- Eligible work is the oldest `QUEUED` request or an expired `IN_PROGRESS` request.
- Active non-expired leases are not reclaimable.
- Final `SUCCEEDED` and `FAILED` requests cannot be claimed.

## Verification

- `go test ./services/teaching-archive-gateway/...`: PASS
- `npm run verify:structure`: PASS
- `npm test`: PASS
- `npm run quality`: PASS

Quality gate summary from `reports/quality-gate.current.json`:

- `allPassed`: true
- `elapsedMs`: 138249
- `npm test`: PASS, 69856 ms
- `go vet`: PASS, 64462 ms
- `cargo test`: PASS, 686 ms
- `identity session runtime audit`: PASS, 655 ms
- `identity access contract audit`: PASS, 702 ms
- `direct-limited connection budget`: PASS, 773 ms
- `pgbouncer connection budget`: PASS, 678 ms

## Dependency Boundary

No package manifests or lockfiles were changed. The baseline workspace still uses Node scripts, Go services, and the Rust agent harness only. No OCR, RAG, model, or training packages were added.

## Rollback

Remove SDD 0036, the worker claim OpenAPI path and schemas, SQL claim metadata columns/index, `IN_PROGRESS` status, claim domain/use-case code, HTTP handler wiring, PostgreSQL claim method, structure verifier entries, and associated tests. SDD 0033 request creation, SDD 0034 query view, and SDD 0035 result writeback remain intact.
