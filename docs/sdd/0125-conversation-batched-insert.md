# SDD 0125: Conversation Batched Insert

## Problem

SDD 0122 through SDD 0124 show that the current Research conversation write
ceiling is dominated by synchronous database pool acquisition. The promoted
profile handles 2900 concurrent create-conversation requests with zero errors,
but each request still competes for a database connection and executes one
single-row insert.

Increasing worker fan-out under the same DB budget did not improve the
low-latency claim. The next measured bottleneck is therefore the number of
database acquisitions required by the write path, not only the number of
gateway processes or HTTP client connections.

## Source Requirement References

- Root requirement: Research mode must stay conversation-first, stable, and
  efficient under high-concurrency teaching and research workflows.
- Root requirement: runtime and package size must remain small, verifiable, and
  free of training/OCR/RAG/vector/embedding dependencies in the baseline.
- Root requirement: local performance secrets use `ueacd`.
- SDD 0124: the current bottleneck remains database pool slot contention under
  synchronous writes; the next optimization should reduce synchronous DB
  acquisition demand per write.

## Scope

In scope:

- Add an optional conversation repository adapter that batches concurrent
  `Create` calls into one multi-row PostgreSQL insert.
- Keep the use-case interface, HTTP contract, response body, event semantics,
  schema, IDs, timestamps, settings JSON, and authorization unchanged.
- Keep batching disabled by default; enable it only through explicit runtime
  configuration for performance evidence.
- Record per-request batch wait timing, DB acquire timing, and DB insert timing
  through `Server-Timing`.
- Teach the benchmark runner to pass and record batch configuration.
- Benchmark both the current profile and an explicit batched profile before
  promoting any claim.

Out of scope:

- Returning before durable persistence.
- Adding external queues, Redis, Kafka, caches, model dependencies, OCR, RAG,
  vectors, embeddings, training dependencies, or public API changes.
- Changing PostgreSQL or PgBouncer global limits.
- Moving root requirement or product architecture decisions out of the
  immutable root requirement boundary.

## Contracts Touched

- `usecase.ConversationRepository` remains `Create(ctx, conversation) error`.
- `postgres.NewConversationRepository` keeps current single-row semantics.
- A new adapter-level repository may implement the same use-case port and batch
  writes when configured.
- Runtime configuration:
  - `CONVERSATION_WRITE_BATCH_SIZE`: `1` disables batching; values above `1`
    enable batching.
  - `CONVERSATION_WRITE_BATCH_DELAY_MS`: maximum flush delay when batching is
    enabled.
- `Server-Timing` may include:
  - `db.batch_wait`: per-request queue wait before a batch insert starts.
  - `db.acquire`: connection acquisition time for the batch, attributed to
    each item in that batch.
  - `db.insert`: multi-row insert duration for the batch, attributed to each
    item in that batch.
- Benchmark reports include `gatewayWriteProfile` with batch size and delay.

## Acceptance Criteria

- Focused repository tests prove:
  - concurrent creates can be flushed as one multi-row insert and one DB
    acquisition;
  - insert errors are returned to every request in the affected batch;
  - context cancellation before flush returns the context error and does not
    block the remaining batch;
  - closing the batching adapter flushes already accepted requests and later
    creates return an explicit closed-repository error instead of panicking;
  - closing the batching adapter unblocks a create call that is waiting for
    queue space while a slow batch insert is in progress;
  - `CONVERSATION_WRITE_BATCH_DELAY_MS=0` flushes sparse creates immediately
    instead of waiting for the configured batch size;
  - single-row repository behavior is unchanged.
- Focused main/config tests prove batching is disabled by default and enabled
  only for `CONVERSATION_WRITE_BATCH_SIZE > 1`.
- Benchmark runner tests prove batch flags are parsed, forwarded to gateway
  processes, and recorded in success/failure profiles without leaking secrets.
- Docker-backed performance evidence compares:
  - current promoted profile: 8 gateways, pool10, client272;
  - batched candidate profile under the same DB connection budget.
- A batched profile is promoted only if it improves tail latency or capacity
  with zero errors and a clear diagnostics story.
- Low-concurrency guard evidence proves `CONVERSATION_WRITE_BATCH_DELAY_MS=0`
  does not add artificial wait to sparse create-conversation traffic before the
  batched profile is treated as the current performance recommendation.
- `npm run quality` passes before merge-ready status.

## Observability And Performance Evidence

Record:

- `reports/2026-06-01-p42-conversation-batched-insert.md`
- `reports/conversation-write-low-concurrency-batch-guard.current.json`
- `reports/2026-06-01-p43-conversation-low-concurrency-batch-guard.md`
- candidate benchmark reports named with `batched-insert`.

## Rollback

Set `CONVERSATION_WRITE_BATCH_SIZE=1` or remove the batching wiring in the
composition root. The existing single-row repository and public API remain
unchanged.
