# SDD 0206: Teaching Quiz Submission Batched Create Tail Latency

## Status

Implemented.

## Problem

Production10k mixed read/write target testing after archive item create batching moved
the Teaching bottleneck to `createQuizSubmission`:

- `createArchiveItem`: P99 147.26ms with archive create batching enabled.
- `createQuizSubmission`: P99 332.08ms, exceeding the root 300ms P99 guardrail.
- The first probe also exposed a configuration bug: batch delay `0` was accepted by
  the benchmark runner but rejected by the Teaching gateway as non-positive.

The root SLO remains unchanged: full-system production10k must reach at least
10k read/write RPS, 0 errors, and max P99 <= 300ms without excluding Teaching.

## Scope

Add synchronous batching for the known teaching quiz submission fast path:

- Keep request semantics synchronous: callers wait for their own create result.
- Preserve fallback behavior: non-teaching or missing quiz archive items still use
  the existing archive lookup path.
- Return `created=false` only for requests whose archive item does not match the
  known teaching quiz condition.
- Reuse the Teaching write batch configuration for the benchmark gateway:
  archive item creates and quiz submissions are both Teaching write bursts under
  the production10k workload.
- Emit `Server-Timing` for quiz submission create so future reports can separate
  batch wait, DB execution, handler time, and client-side delay.

## Contracts

- Batch size `<=1` disables quiz submission batching.
- Batch workers must be at least one when batching is enabled.
- Batch delay `0` means flush currently ready requests without waiting for a
  full batch.
- Insert errors are returned to every active request in the batch.
- Reports must mask local secrets and database URLs.

## Acceptance Criteria

- Focused Go and Node tests pass.
- Production10k target step reports:
  - `gatewayWriteProfile.quizSubmissionBatchingEnabled=true`.
  - 0 total errors.
  - Read/write RPS >= 10000.
  - Max P99 <= 300ms.

## Rollback

Set `TEACHING_QUIZ_SUBMISSION_BATCH_SIZE=1`, or set the shared Teaching write
batch size to `1` in benchmark runners. The direct repository path remains
available.
