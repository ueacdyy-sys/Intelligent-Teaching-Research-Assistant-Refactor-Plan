# SDD 0212: Teaching Archive Production10k Worker Profile

## Problem

The production10k mixed workload with the Conversation durable fast-lane still
misses the Root SLO tail-latency target. The slowest Teaching Archive phase is
`createArchiveItem`:

- P99: 215.22ms.
- App P99: 176.71ms.
- `db.batch_wait` P99: 117.97ms.
- `db.insert` P99: 121.56ms.
- `archiveCreateBatchWorkers`: 1.

The current profile proves throughput, but it also proves that a single Teaching
archive create worker lets requests queue behind batch flush and PostgreSQL
insert work.

## Scope

- Keep the public Teaching Archive HTTP contract unchanged.
- Keep the synchronous Teaching write path as the baseline until parent-child
  write dependencies are explicitly handled.
- Raise the production10k Teaching batch worker profile so archive-item create
  work has multiple independent flush lanes per gateway.
- Keep the benchmark runner profile explicit so future performance evidence can
  tie tail-latency changes to a reproducible configuration.

## Non-Scope

- Claiming Teaching Archive has reached 50ms or 10ms P99 before a Docker/WSL
  mixed workload rerun proves it.
- Switching archive item creation to asynchronous `202 Accepted` in this slice.
- Breaking the immediate `createArchiveItem -> createQuizSubmission` dependency
  in the benchmark or product workflow.
- Adding Redis, Kafka, vector stores, model-serving, or training dependencies.

## Design

`createQuizSubmission` depends on the archive item existing in PostgreSQL. The
schema enforces this with a foreign key from `teaching_quiz_submissions` to
`teaching_archive_items`, and the optimized quiz submission path joins against
`teaching_archive_items` before inserting.

Because of that dependency, Teaching Archive cannot safely copy the Conversation
fast-lane as-is. A durable asynchronous archive command would need one of these
later designs before it can replace synchronous create:

- a settle/read-your-write barrier before dependent quiz submissions;
- a combined parent-child command projection;
- or a read model that exposes accepted-but-not-projected archive items.

This slice instead removes the current single-worker queue bottleneck in the
production10k evidence profile.

## Contracts

The Teaching Archive public HTTP contract remains unchanged:

```http
POST /v1/teaching/archive-items
201 Created
```

The benchmark profile contract changes only the reproducible production10k
runtime settings. Evidence produced from this profile must report the effective
`gatewayWriteProfile.archiveCreateBatchWorkers` value.

## Configuration

The production10k scale-up profile sets:

```text
teachingArchiveCreateBatchWorkers=4
```

Quiz submission batching inherits the same worker count unless explicitly
overridden, so both write-heavy Teaching phases get multiple flush lanes while
remaining behind the existing PostgreSQL persistence boundary.

## Acceptance Criteria

- Unit tests prove the production10k target step uses 4 Teaching archive create
  batch workers.
- The default scale-up ladder remains unchanged.
- `npm run quality` stays green after the profile change.
- A later Docker/WSL production10k run must record whether this lowers Teaching
  P99, `db.batch_wait` P99, and `db.insert` P99.

## Rollback

Set `teachingArchiveCreateBatchWorkers` back to `1` in the production10k profile.
No public API, database schema, or use case behavior changes.
