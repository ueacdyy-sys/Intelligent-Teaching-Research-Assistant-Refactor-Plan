# SDD 0132: Conversation Fanout Decision Audit

## Problem

SDD 0131 proved that adding more Research conversation write gateway workers is
not automatically better on this desktop performance profile. The 24-worker
and 32-worker WSL2 probes reduced per-worker current connection pressure, but
they worsened end-to-end tail latency. The 32-worker 30000-concurrency probe
also produced connection reset errors.

That decision must be encoded as a repeatable audit. Otherwise a future
configuration edit could raise gateway fanout because the higher worker count
looks intuitively faster, even though the current evidence says the opposite.

## Source Requirement References

- Root requirement: Research conversation persistence must remain stable and
  efficient under high-concurrency desktop operation.
- SDD 0000: performance-sensitive refactor slices need machine-checkable
  contracts, evidence, rollback, and quality gates.
- SDD 0125: batched inserts are the promoted write-path optimization.
- SDD 0130: WSL2 load generation is the current high-concurrency loadgen path.
- SDD 0131: direct16 is the current promoted worker fanout; 32 workers at
  30000 concurrency is a negative probe.

## Scope

In scope:

- Add a Docker-free Node audit over existing WSL2 conversation write benchmark
  reports.
- Compare same-concurrency fanout candidates by zero-error status, P99 latency,
  client/server gap P99, RPS, and database acquisition timing.
- Verify that the proposed PgBouncer connection budget matches the selected
  worker fanout.
- Generate a machine-readable current report for the performance evidence
  registry and quality gate.

Out of scope:

- Running new live WSL2 or Docker benchmarks.
- Changing public Research conversation API contracts.
- Introducing training, OCR, vector, embedding, RAG, or model dependencies.
- Claiming full-system sustained capacity from the conversation-only short
  burst benchmark.

## Contracts

- The audit must not hard-code direct16 as an eternal answer. If a higher
  fanout report has zero errors and lower same-concurrency P99, the
  recommendation can change.
- A higher fanout with errors must be classified as a negative probe.
- `db.acquire` P99 must remain below the configured database-bottleneck
  threshold before the audit treats fanout as the limiter.
- The selected fanout must match
  `conversation-write-gateway-via-pgbouncer.maxConns` in the proposed PgBouncer
  connection budget.
- The audit must run without Docker and without depending on live PostgreSQL.

## Acceptance Criteria

- `tools/conversation-fanout-decision-audit.test.mjs` covers:
  - direct16 selected from the current 30000-concurrency evidence;
  - 32-worker failed probe classified as negative;
  - missing report fails readiness;
  - a better zero-error higher-fanout fixture can change the recommendation.
- `npm run audit:conversation-fanout-decision` writes
  `reports/conversation-fanout-decision.current.json`.
- `npm run quality` runs the fanout audit before the performance registry audit.
- The performance evidence registry cites the fanout decision audit as current
  configuration evidence.
- `npm run quality` passes before the slice is considered complete.

## Rollback

Remove the fanout decision audit from the quality command plan and performance
evidence registry. SDD 0131 benchmark reports remain the source evidence for
manual review.

## Observability And Performance Evidence

The audit report records:

- compared source report paths;
- worker count, concurrency, status, errors, RPS, P95, P99, and server P99;
- client/server gap P99;
- `db.acquire` P99 and `db.insert` P99;
- database connection budget per worker and total;
- runtime diagnostic worker count and max current connection range;
- selected recommendation and negative probes.
