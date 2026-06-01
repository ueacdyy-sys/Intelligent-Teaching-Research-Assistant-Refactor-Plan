# SDD 0129: Conversation Dockerized Load Generator Upper Bound

## Problem

SDD 0128 proved that the Research conversation benchmark runner can move the
load generator into Docker while keeping gateway workers on the host. The
previous local high-concurrency slice showed a strong 5800-concurrency pass
point and a 6200-concurrency edge where the application and database path
looked healthy but Windows-local client transport hit socket or scheduling
pressure.

The next performance decision needs live Dockerized load-generator evidence. A
new capacity claim is valid only if it separates the application write path
from the local benchmark client's socket pressure.

## Source Requirement References

- Root requirement: Research mode needs stable, efficient multi-model
  conversation persistence under high-concurrency desktop operation.
- SDD 0000: packaging and runtime must stay small and stable; optional runtime
  choices need contracts, tests, evidence, and rollback.
- SDD 0125: batched inserts keep synchronous conversation creation while
  reducing database write amplification.
- SDD 0127: gateway runtime diagnostics expose listener and connection
  pressure.
- SDD 0128: Dockerized benchmark runtime provides a load-generator comparison
  path without changing baseline application runtime.

## Scope

In scope:

- Run Dockerized conversation write probes using the same promoted application
  profile as the best local run: 16 gateway workers, 1 application-side
  PostgreSQL connection per worker, PgBouncer transaction pooling, batch size
  64, and batch delay 0ms.
- Collect gateway runtime diagnostics, gateway database diagnostics,
  PgBouncer diagnostics, and PostgreSQL diagnostics.
- Compare Dockerized results against the prior Windows-local 5800/6200
  evidence.
- Keep test data cleanup explicit by truncating `research_conversations`
  before and after live probes.

Out of scope:

- Changing the public Research conversation API.
- Changing PostgreSQL, PgBouncer, or application database pool limits.
- Moving gateway workers or production ingress into Docker.
- Adding OCR, RAG, vector, embedding, model, or training dependencies to the
  baseline runtime.
- Promoting a new current performance ceiling if Dockerized probes pass only
  functionally but miss the tail-latency target.

## Contracts

- Dockerized upper-bound reports must include
  `benchmarkRuntimeProfile.executor = DOCKER_GO`.
- Reports must include `gatewayRuntimeDiagnostics` with all expected gateway
  workers sampled before and after the benchmark.
- Reports must include `gatewayWriteProfile.batchSize = 64` and
  `gatewayDatabaseProfile.dbMaxConnsPerWorker = 1`.
- New capacity interpretation must distinguish:
  - zero-error functional capacity,
  - low-tail current capacity, and
  - failed/edge probes.

## Acceptance Criteria

- `reports/conversation-write-http-benchmark.docker-direct16-concurrency5800-batched64.json`
  exists and records a Dockerized 5800-concurrency probe.
- A 6200-concurrency Dockerized probe is attempted and recorded as either a
  pass, an edge pass, or a failure with sanitized diagnostics.
- A report summarizes the comparison and states whether Dockerized load
  generation changes the previously observed bottleneck.
- Secret scan finds no raw `ueacd`, `postgres://`, or `postgresql://` in new
  benchmark JSON reports.
- `research_conversations` is truncated after the live probes and the Docker
  performance profile is stopped.
- Focused benchmark tests and `npm run quality` pass after the evidence run.

## Rollback

Remove SDD 0129 and any Dockerized high-concurrency reports from the evidence
set. The SDD 0128 Docker runtime capability and earlier local high-concurrency
evidence remain valid.

## Observability And Performance Evidence

Record for each probe:

- benchmark runtime executor and target URLs,
- concurrency, operations, RPS, P95, P99, and errors,
- server-side P99 and server timing breakdown,
- DB acquire P99,
- gateway runtime accepted/current/max connection counters,
- PgBouncer and PostgreSQL diagnostic snapshots.
