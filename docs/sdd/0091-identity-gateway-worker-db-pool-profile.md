# SDD 0091: Identity Gateway Worker DB Pool Profile

## Problem

The current Identity HTTP evidence shows that the 2600-concurrency profile
passes with thirteen ingress workers and four gateway workers, while the
nearest 2800-concurrency probe fails during `passwordLogin` with ingress
`502 upstream unavailable` responses. That points to gateway/upstream write
path pressure rather than the earlier client-to-entry cold connection wall.

The benchmark runner already accepts `--gateway-count` and
`--session-db-max-conns`, but successful reports do not record the per-gateway
database pool or total gateway-side database client budget. Without that
runtime profile, a higher-worker benchmark cannot prove whether the result came
from safe worker fan-out or from silently over-allocating database clients.

## Source Requirement References

- Root requirement: teacher, student, and remote entry points need a stable
  shared identity boundary.
- SDD 0008: durable sessions must support shared workers and token lifecycle
  correctness.
- SDD 0012: HTTP gateway benchmarks provide client-facing Identity performance
  evidence.
- SDD 0089: the current multi-ingress pass point is 2600 concurrency and the
  nearest failed probe is 2800 concurrency.
- SDD 0090: refresh rotation is now one database round trip, so the next
  performance slice should inspect gateway/upstream saturation and remaining
  mixed write/read tail latency.

## Scope

In scope:

- Add a gateway database profile to Identity HTTP benchmark reports.
- Record gateway worker count, per-worker `SESSION_DB_MAX_CONNS`, and total
  configured gateway database client connections.
- Include that profile in both success and failure evidence.
- Use the profile to compare a higher gateway-worker benchmark while keeping
  total gateway database client pressure inside the PgBouncer performance
  budget.
- Keep `npm test` Docker-free.

Out of scope:

- Changing public Identity HTTP contracts.
- Changing token TTLs or session semantics.
- Increasing PostgreSQL or PgBouncer server limits without evidence.
- Introducing Redis, external caches, model dependencies, OCR, RAG, vector
  databases, embeddings, or training dependencies.

## Contracts

- Identity HTTP benchmark JSON includes:
  - `gatewayWorkerCount`
  - `gatewayDatabaseProfile.sessionDbMaxConnsPerWorker`
  - `gatewayDatabaseProfile.sessionDbMaxConnsTotal`
- Failure reports keep masking local secrets and DSNs.
- Existing ingress profile fields remain unchanged.

## Acceptance Criteria

- A focused Node test fails before the runner records the gateway database
  profile.
- Success reports include gateway worker and database-client budget fields.
- Failure reports include the same gateway database profile for failed boundary
  evidence.
- A higher-worker benchmark can be registered only with explicit database
  budget evidence.
- `npm test` remains Docker-free and passes.
- `npm run quality` passes.
- Rust build output `services/agent-harness/target` is removed after Cargo
  tests and verified absent.

## Rollback

Remove SDD 0091, the benchmark report profile additions, tests, new live
evidence, and any registry entries for the higher-worker profile. Existing
multi-ingress evidence from SDD 0089 and refresh fast-path evidence from SDD
0090 remain valid.

## Observability And Performance Evidence

Record:

- Red focused runner test before implementation.
- Focused runner test after implementation.
- Live Identity HTTP benchmark for a higher gateway-worker profile.
- Performance evidence registry audit result if a new report is registered.
- `npm test` and `npm run quality` results.
