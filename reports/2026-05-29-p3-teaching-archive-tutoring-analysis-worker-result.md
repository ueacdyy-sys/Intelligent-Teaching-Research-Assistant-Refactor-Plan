# P3 Teaching Archive Tutoring Analysis Worker Result

Date: 2026-05-29
Slice: SDD 0035
Branch: codex/sdd-tdd-refactor

## Root Requirement Trace

- Archive material can move into tutoring mode for analysis.
- Personalized tutoring can visualize student ability and analyze progress.
- Tutoring mode reserves a personalized question-bank check after tutoring.
- OCR, RAG, model execution, and model training remain worker-side concerns and are not added to the baseline runtime.

## Red Evidence

Before implementation, `go test ./services/teaching-archive-gateway/...` failed because the worker result boundary did not exist. Representative missing symbols:

- `domain.ApplyTutoringAnalysisResult`
- `domain.RecordTutoringAnalysisResultInput`
- `domain.TutoringAnalysisStatusSucceeded`
- `domain.TutoringAnalysisStatusFailed`
- `usecase.NewRecordTutoringAnalysisResult`
- HTTP `NewServer` argument shape for the new use case

## Implementation

- Added SDD 0035 for metadata-only worker result writeback.
- Added `POST /v1/teaching/tutoring-analysis-requests/{requestId}/worker-result`.
- Allowed only `SERVICE` principals from `AGENT_INTERNAL` with `TEACHING_WRITE`.
- Supported final `SUCCEEDED` and `FAILED` statuses.
- Required `resultSummary` and `resultRef` for success.
- Required `errorMessage` for failure.
- Allowed `questionBankDraftRef` only when the request reserved `GENERATE_PERSONALIZED_CHECK`.
- Stored result metadata, `completedAt`, and `updatedAt`.
- Returned `409 CONFLICT` for final-status overwrite attempts.
- Kept generated questions, OCR/RAG calls, model execution, and training dependencies out of this slice.

## Post-Review Hardening

- Tightened the OpenAPI request contract into success and failure variants so client-visible schema matches domain rules.
- Rejected cross-status payloads, such as error fields on `SUCCEEDED` and result fields on `FAILED`.
- Moved final-status overwrite protection into the PostgreSQL `UPDATE` predicate with `status NOT IN ($10, $11)`, so concurrent workers cannot overwrite a completed request after both read the same queued row.

## Verification

- `go test ./services/teaching-archive-gateway/...`: PASS
- `npm run verify:structure`: PASS
- `npm test`: PASS
- `npm run quality`: PASS

Quality gate summary from `reports/quality-gate.current.json`:

- `allPassed`: true
- `elapsedMs`: 124922
- `npm test`: PASS, 69246 ms
- `go vet`: PASS, 51613 ms
- `cargo test`: PASS, 819 ms
- `identity session runtime audit`: PASS, 736 ms
- `identity access contract audit`: PASS, 686 ms
- `direct-limited connection budget`: PASS, 697 ms
- `pgbouncer connection budget`: PASS, 667 ms

## Dependency Boundary

No package manifests or lockfiles were changed. The baseline workspace still uses Node scripts, Go services, and the Rust agent harness only. No OCR, RAG, model, or training packages were added.

## Rollback

Remove SDD 0035, the worker result OpenAPI path and schemas, SQL result metadata columns, result domain/use-case code, HTTP handler wiring, PostgreSQL writeback method, structure verifier entries, and the associated tests. SDD 0033 request creation and SDD 0034 query view remain intact.
