# P3 Teaching Archive Tutoring Analysis Result Lease Guard

Date: 2026-05-29
Slice: SDD 0037
Branch: codex/sdd-tdd-refactor

## Root Requirement Trace

- Archive material can move into tutoring mode for analysis.
- Personalized tutoring can visualize student ability and analyze progress.
- Tutoring mode reserves a personalized question-bank check after tutoring.
- Worker execution remains behind job/result boundaries.
- OCR, RAG, model execution, and model training remain worker-side concerns and are not added to the baseline runtime.

## Red Evidence

Before implementation, `go test ./services/teaching-archive-gateway/...` failed because result writeback inputs and tests expected worker ownership but the domain contract did not carry `workerId`. Representative compiler errors:

- `unknown field WorkerID in struct literal of type domain.RecordTutoringAnalysisResultInput`
- Failure sites included domain and use-case tests for tutoring analysis result writeback.

## Implementation

- Added SDD 0037 for worker result lease ownership.
- Required `workerId` on success and failure result writeback schemas.
- Required result writeback to target an `IN_PROGRESS` request.
- Required `workerId` to match `claimedByWorkerId`.
- Required `claimExpiresAt` to exist and still be active at completion time.
- Returned conflict for queued, expired, mismatched-worker, or already-final requests.
- Kept the PostgreSQL result update atomic with `status`, `claimed_by_worker_id`, and `claim_expires_at` predicates.
- Updated HTTP request decoding and tests so `workerId` reaches the domain boundary.
- Extended structure verification to require SDD 0037.

## Review Hardening

- The first strict quality run caught `server_test.go` at 804 lines with an 800-line project limit.
- The HTTP worker result regression test and claimed fixture were moved into a focused test file; final `server_test.go` length is 775 lines.
- No runtime behavior was changed by that quality repair.

## Verification

- `go test ./services/teaching-archive-gateway/...`: PASS
- `npm run verify:structure`: PASS
- `npm test`: PASS
- `npm run quality`: PASS

Quality gate summary from `reports/quality-gate.current.json`:

- `allPassed`: true
- `elapsedMs`: 137502
- `npm test`: PASS, 69378 ms
- `go vet`: PASS, 64261 ms
- `cargo test`: PASS, 725 ms
- `identity session runtime audit`: PASS, 660 ms
- `identity access contract audit`: PASS, 710 ms
- `direct-limited connection budget`: PASS, 680 ms
- `pgbouncer connection budget`: PASS, 664 ms

## Dependency Boundary

No package manifests or lockfiles were changed. The baseline workspace still uses Node scripts, Go services, and the Rust agent harness only. No OCR, RAG, model, or training packages were added.

## Rollback

Remove SDD 0037, remove the `workerId` requirement from worker result schemas and handlers, remove worker lease checks from result domain/use-case logic, remove status/worker/lease predicates from the PostgreSQL result update, remove structure verifier entries for SDD 0037, and remove the associated tests. SDD 0035 result writeback and SDD 0036 worker claims remain otherwise intact.
