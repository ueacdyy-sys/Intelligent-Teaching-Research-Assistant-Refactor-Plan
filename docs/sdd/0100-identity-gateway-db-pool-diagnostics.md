# SDD 0100: Identity Gateway DB Pool Diagnostics

## Problem

The current 4400-concurrency Identity evidence can prove that the HTTP stack
passes without request errors, but it still cannot explain why the mixed
read/write path keeps a multi-second tail. SDD 0098 showed that client
transport capacity affected the `revokeCycle` P99. SDD 0099 removed redundant
token indexes, which reduced schema write amplification but did not materially
improve the 4400 tail.

The remaining bottleneck could be gateway DB pool waiting, PgBouncer scheduling,
PostgreSQL write pressure, ingress-to-gateway queueing, or benchmark client
transport. End-to-end phase latency alone is not enough to distinguish these.

## Source Requirement References

- Root requirement: teacher, student, and remote entry points need a stable
  shared identity boundary.
- Root requirement: packaging and runtime must stay small, efficient, and
  stable for desktop operation.
- SDD 0091: benchmark reports must record gateway worker and DB connection
  budgets before claiming higher concurrency capacity.
- SDD 0098: client transport tuning changed the `revokeCycle` P99 but left the
  write-path P95 high.
- SDD 0099: redundant token index removal was correct but did not solve the
  4400 mixed read/write tail.

## Scope

In scope:

- Add an internal-only Identity gateway diagnostics endpoint for session DB
  pool statistics.
- Gate the endpoint with an internal diagnostics secret. Local default remains
  `ueacd`.
- Keep the endpoint out of the public Identity OpenAPI contract.
- Expose only aggregate pool counters and durations, never DSNs, credentials,
  tokens, principals, or request payloads.
- Teach the Identity HTTP benchmark runner to sample direct gateway diagnostics
  before and after each benchmark and write those snapshots into success and
  failure reports.
- Reject ingress/gateway port plans that overlap, because an overlap makes the
  runner treat an already-running gateway as if it were an ingress worker.
- Keep `npm test` Docker-free.

Out of scope:

- Changing public Identity HTTP contracts.
- Changing session, token, role, or access semantics.
- Raising PostgreSQL, PgBouncer, gateway, or ingress limits.
- Introducing Redis, model dependencies, OCR, RAG, vector databases,
  embeddings, or training dependencies.

## Contracts

- `GET /internal/identity/session-db-pool` returns `404` when no diagnostics
  provider is configured.
- When diagnostics are configured, the endpoint requires header
  `X-Internal-Diagnostics-Secret`.
- The local default diagnostics secret is `ueacd`.
- A missing or incorrect diagnostics secret returns `401`.
- A valid response includes:
  - `stats.maxConns`
  - `stats.totalConns`
  - `stats.acquiredConns`
  - `stats.idleConns`
  - `stats.constructingConns`
  - `stats.acquireCount`
  - `stats.acquireDurationMs`
  - `stats.canceledAcquireCount`
  - `stats.emptyAcquireCount`
  - `stats.emptyAcquireWaitTimeMs`
  - `stats.newConnsCount`
  - `stats.maxIdleDestroyCount`
  - `stats.maxLifetimeDestroyCount`
- Identity HTTP benchmark reports may include
  `gatewayDatabaseDiagnostics.before` and
  `gatewayDatabaseDiagnostics.after`, each sampled from direct gateway base
  URLs rather than ingress URLs.
- When `--ingress-proxy true`, every configured ingress port must be distinct
  from every direct gateway port.
- A port overlap fails before any gateway or ingress process is spawned and
  writes a masked failure report.
- Failure reports must continue masking local secrets and PostgreSQL DSNs.

## Acceptance Criteria

- A focused HTTP adapter test fails before the internal diagnostics endpoint is
  implemented.
- A focused runner test fails before the benchmark report can collect and attach
  gateway DB pool diagnostics.
- A focused runner test fails before ingress/gateway port overlap is rejected.
- The focused HTTP adapter diagnostics tests pass after implementation.
- The focused runner diagnostics tests pass after implementation.
- `npm test` passes.
- `npm run quality` passes.
- Rust build output `services/agent-harness/target` is removed after Cargo
  tests and verified absent.

## Rollback

Remove this SDD, the internal diagnostics endpoint, runner diagnostic sampling,
focused tests, and any evidence registered from diagnostics-enabled benchmark
runs. SDD 0098 and SDD 0099 remain the current high-concurrency evidence.

## Observability And Performance Evidence

Record:

- Red focused HTTP adapter and runner tests before implementation.
- Green focused HTTP adapter and runner tests after implementation.
- A follow-up Dockerized 4400 client-200 probe with before/after gateway DB
  pool diagnostics.
- Performance evidence registry audit result if a new report is registered.
- `npm test` and `npm run quality` results.
