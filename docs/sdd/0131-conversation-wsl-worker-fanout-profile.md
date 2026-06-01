# SDD 0131: Conversation WSL Worker Fanout Profile

## Problem

SDD 0130 moved the Research conversation write load generator into Ubuntu WSL2
and showed that the direct16 profile can pass 30000 concurrent short-burst
conversation writes with zero errors. The database path stayed healthy:
`db.acquire` P99 stayed at 0ms, while end-to-end tail latency was dominated by
client/server gap.

At 30000 concurrency, the 16 host-started gateway workers observed high
per-worker current connection pressure. The next performance slice should test
whether increasing gateway worker fanout, while keeping one application-side
PostgreSQL connection per worker, reduces listener scheduling pressure and
improves high-concurrency tail latency.

## Source Requirement References

- Root requirement: Research mode needs stable, efficient multi-model
  conversation persistence under high-concurrency desktop operation.
- SDD 0000: performance changes need contracts, evidence, rollback, and
  quality gates.
- SDD 0125: batched inserts reduce database write amplification.
- SDD 0127: runtime diagnostics expose listener and connection pressure.
- SDD 0130: WSL2 load generation avoids both Windows-local socket pressure and
  Docker Desktop host-network overhead.

## Scope

In scope:

- Run WSL2 load-generation probes comparing 16, 24, and 32 host-started
  conversation gateway workers.
- Keep `DB_MAX_CONNS=1`, `CONVERSATION_WRITE_BATCH_SIZE=64`, and
  `CONVERSATION_WRITE_BATCH_DELAY_MS=0`.
- Keep PostgreSQL and PgBouncer settings unchanged.
- Update the proposed PgBouncer connection budget only if live evidence shows a
  higher gateway worker count improves the practical high-concurrency profile.

Out of scope:

- Changing public Research conversation API contracts.
- Introducing training, OCR, vector, embedding, RAG, or model dependencies.
- Moving the production gateway into WSL or Docker.
- Claiming full-system capacity from a conversation-only short-burst workload.

## Contracts

- The recommended worker fanout must stay inside the PgBouncer transaction
  profile connection budget.
- Reports must include `gatewayWorkerCount`, `gatewayDatabaseProfile`,
  `gatewayWriteProfile`, `benchmarkRuntimeProfile.executor = WSL_GO`, and
  gateway runtime diagnostics for every expected worker.
- A promoted higher-fanout profile must improve at least one of:
  - same-concurrency P99;
  - same-concurrency client/server gap P99;
  - same-concurrency RPS;
  without increasing `db.acquire` P99 into a database bottleneck.

## Acceptance Criteria

- WSL2 probes exist for at least one higher worker fanout above 16.
- A report compares 16, 24, and/or 32 worker fanout against the existing WSL2
  direct16 evidence.
- The proposed PgBouncer connection budget is updated only when evidence
  supports the new recommendation.
- Performance evidence registry audit passes after any new promoted evidence.
- `npm run quality` passes before the slice is considered complete.
- `research_conversations` is truncated after live probes and the Docker
  performance profile is stopped.

## Rollback

Revert the proposed PgBouncer connection budget fanout change and remove the
new higher-fanout performance evidence from the registry. SDD 0130 WSL2 direct16
evidence remains valid.

## Observability And Performance Evidence

Record for each fanout probe:

- worker count and total application-side DB connection budget;
- concurrency, operations, RPS, P95, P99, and errors;
- server P99 and Server-Timing breakdown;
- DB acquire P99 and INSERT P99;
- gateway runtime max current connections per worker;
- PgBouncer and PostgreSQL diagnostics.
