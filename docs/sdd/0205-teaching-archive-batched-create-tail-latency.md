# SDD 0205: Teaching Archive Batched Create Tail Latency

## Problem

Current production10k evidence has already used Docker/WSL load generators,
multiple gateway workers, PostgreSQL, and PgBouncer. Throughput is above the
10k read/write target with zero errors, but Root SLO promotion is still blocked
by interactive tail latency.

The latest diagnostic run shows the slow path moved to Teaching Archive
`createArchiveItem`. PgBouncer had no client queue, while Teaching server timing
showed high `db.acquire` P99 and PostgreSQL diagnostics showed WAL/page
contention when gateway or DB pool counts were simply raised. That means the
remaining bottleneck is not missing Docker, PostgreSQL, or worker count. It is
the synchronous single-row Teaching create path:

- every create request performs one pgxpool acquire;
- every create request performs one single-row `INSERT`;
- under 384 Teaching concurrency and full-system write pressure, this amplifies
  pool contention and PostgreSQL WAL/index write cost.

Conversation writes already use synchronous batching to preserve API semantics
while reducing database round trips. Teaching Archive needs the same evidence
driven optimization for `createArchiveItem`.

## Scope

- Add a Teaching Archive batching repository for `ArchiveRepository.Create`.
- Preserve synchronous create semantics: accepted callers wait until their row
  is persisted or the batch error is returned.
- Build one multi-row `INSERT INTO teaching_archive_items` per batch.
- Add `db.batch_wait` timing to Teaching `Server-Timing`.
- Add gateway env configuration:
  - `TEACHING_ARCHIVE_CREATE_BATCH_SIZE`
  - `TEACHING_ARCHIVE_CREATE_BATCH_DELAY_MS`
  - `TEACHING_ARCHIVE_CREATE_BATCH_WORKERS`
- Pass and report Teaching batch settings through Teaching, mixed, sustained,
  and production10k scale-up benchmark runners.
- Keep production10k target checks on the full system, including Teaching.

## Non-Goals

- Lowering the root `300ms` interactive P99 target.
- Excluding Teaching Archive from Root SLO evidence.
- Changing Teaching API behavior, authorization, response bodies, or root
  product requirements.
- Adding model, vector database, training, Mem0, Milvus, vLLM, SFT, RL, or FP8
  dependencies.
- Blindly increasing gateway workers or database pools without diagnostics.

## Contracts

- Batch size `<=1` disables Teaching Archive create batching.
- Batch workers default to one and must be at least one when batching is
  enabled.
- Batch delay defaults to zero milliseconds, which flushes the currently ready
  requests without waiting for a full batch.
- Canceled requests are skipped before flush and receive their context error.
- Insert errors are returned to every active request in the batch.
- `Close` flushes already accepted queued requests and rejects later creates.
- Reports must mask local secrets and database URLs.

## Acceptance Criteria

- Go tests prove concurrent Teaching archive creates are grouped into a single
  multi-row insert.
- Go tests prove cancellation, insert errors, close flushing, and create after
  close behavior.
- HTTP tests prove `db.batch_wait` is emitted in `Server-Timing`.
- Gateway config tests prove batching is disabled by default and enabled only
  when batch size is above one.
- Tool tests prove Teaching batch settings parse, validate, pass to gateway
  workers, and are recorded in reports.
- System runner tests prove mixed, sustained, and production10k scale-up
  profiles pass and report Teaching batch settings.
- A target-bearing production10k default run keeps measured read/write RPS above
  10k with zero errors and reduces max P99 to `<=300ms`.
- `npm run audit:root-slo-promotion-review`,
  `npm run audit:system-capacity-claim`, and
  `npm run audit:performance-evidence` pass before promotion.

## Rollback

Set `TEACHING_ARCHIVE_CREATE_BATCH_SIZE=1`, or set
`teachingArchiveCreateBatchSize=1` in benchmark runners. Functionality remains
correct, but production10k write pressure can again charge every Teaching
create to a separate pool acquire and single-row insert.
