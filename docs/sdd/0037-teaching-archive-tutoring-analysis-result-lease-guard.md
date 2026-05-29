# SDD 0037: Teaching Archive Tutoring Analysis Result Lease Guard

## Problem

SDD 0036 gives Python AI workers a Go-owned way to claim one tutoring analysis request with a bounded lease. SDD 0035 still lets any authorized internal service principal record a final result for any non-final request. That leaves a gap: a stale worker, a different worker, or a broad internal service credential could write completion metadata for work it did not currently own.

The root requirement needs archive material to flow into tutoring mode for ability visualization, progress analysis, and personalized question-bank checks. The worker result boundary must therefore be tied to the worker claim boundary, while still keeping OCR, RAG, model calls, generated questions, and training dependencies outside the baseline runtime.

## Source Requirement References

- Root requirement: archive material can be transferred to tutoring mode for analysis.
- Root requirement: personalized tutoring assistant can visualize student ability and analyze progress.
- Root requirement: tutoring mode should add a personalized question bank to detect student level after tutoring.
- Root requirement: AI/RAG/OCR/model dependencies remain worker-side concerns.
- Whole-system map: AI Workers are Python behind a Job API and should not directly write or poll the main database.
- SDD 0035: Teaching Archive records metadata-only worker results.
- SDD 0036: Teaching Archive workers claim requests with a bounded lease.

## Scope

In scope:

- Require `workerId` on worker result writeback.
- Only allow result writeback for `IN_PROGRESS` requests.
- Require `workerId` to match the current `claimedByWorkerId`.
- Reject result writeback when the claim lease is missing or expired.
- Keep the PostgreSQL result update atomic with status, worker, and lease predicates.
- Preserve metadata-only result payloads and existing success/failure validation.
- Keep model execution, OCR/RAG, generated questions, and training artifacts out of this slice.

Out of scope:

- Python worker implementation.
- Worker heartbeat or lease extension.
- Dead-letter queues and retry policy.
- Generated personalized question content.
- TypeScript SDK generation.

## Contracts

Updated contracts:

- `contracts/openapi/teaching-archive.yaml`

Go service:

- `services/teaching-archive-gateway`
- Use case: `RecordTutoringAnalysisResult`

PostgreSQL adapter:

- Result writeback remains a single `UPDATE`, now guarded by `status`, `claimed_by_worker_id`, and `claim_expires_at`.

## Acceptance Criteria

- Domain tests prove a matching active worker lease can record success metadata.
- Domain tests prove queued requests cannot be completed without a claim.
- Domain tests prove a mismatched worker cannot record a result.
- Domain tests prove an expired lease cannot record a result.
- HTTP tests prove worker result requests require and echo through a valid `workerId`.
- PostgreSQL adapter result update includes atomic status, worker, and lease predicates.
- Structure verification requires SDD 0037.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove the `workerId` requirement from the worker result request schema and handlers, remove lease checks from result domain/use-case logic, and remove status/worker/lease predicates from the PostgreSQL result update. SDD 0035 result writeback and SDD 0036 worker claims remain otherwise intact.

## Observability And Performance Evidence

Record:

- failing test evidence before implementation.
- targeted Teaching Archive Go test result after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that no OCR/RAG/model/training dependencies were added.
