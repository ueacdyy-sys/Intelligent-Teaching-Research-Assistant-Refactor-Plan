# SDD 0146: Identity Worker Pool Cold Start And Tail Probe

## Problem

Root SLO promotion review still blocks full-system ultra-concurrency because
Identity and Access contributes the slowest interactive P99. The current source
evidence uses six Identity gateway workers with twelve PostgreSQL pool
connections each. That profile passes at 4400 logical clients, but its revoke
cycle P99 is still above the root target.

A natural next configuration is more gateway workers with a smaller per-worker
database pool. Before using that profile as evidence, the runtime must survive
multi-worker cold start against a fresh PostgreSQL database and the load
generator must not fail because of local Windows socket fanout.

## Scope

In scope:

- Harden Identity PostgreSQL schema initialization against concurrent gateway
  cold-start DDL races.
- Retry only PostgreSQL schema-race SQLSTATEs produced by concurrent
  `CREATE ... IF NOT EXISTS` / schema DDL.
- Keep session write, refresh, revoke, and remote command semantics unchanged.
- Run an eight-worker, smaller-pool Docker probe and record both the failed
  high-fanout ingress result and the passed lower-fanout result.
- Keep the current root SLO claim blocked unless the evidence actually meets
  the root latency and sustained scale gates.

Out of scope:

- Promoting eight workers as the default Identity profile.
- Hiding or ignoring ingress/socket failures.
- Changing public Identity HTTP contracts.
- Adding caches, queues, model dependencies, OCR, RAG, vector DB, embeddings,
  training, or new load-generation dependencies.

## Contracts

- Identity HTTP API contracts are unchanged.
- `contracts/sql/identity-sessions.sql` keeps the same session and remote
  command nonce table contract.
- `EnsureSchemaWithConfig` remains the composition-root schema initializer for
  logged and unlogged session table profiles.
- The retry behavior is internal to schema initialization only and is not a
  session-store write contract.
- Benchmark reports preserve both failed and passed worker/pool probes with
  their original status values.

## Root Cause

The first eight-worker probe failed before the benchmark could measure steady
state because several gateway processes started against a fresh database at the
same time. PostgreSQL returned schema DDL race errors such as `23505` on system
catalog unique indexes while multiple processes attempted idempotent schema
creation.

After the schema retry fix, the same eight-worker configuration passed cold
start, but the high-fanout ingress profile failed under Windows socket pressure:

`bind: An operation on a socket could not be performed because the system lacked sufficient buffer space or because a queue was full.`

That separates two concerns:

- gateway cold-start stability is a real service bug and is fixed here;
- high-fanout ingress transport pressure is a benchmark topology limit, not a
  successful service-capacity signal.

## Implementation

- `EnsureSchemaWithConfig` now executes schema statements through a narrow
  retry helper.
- The retry helper recognizes PostgreSQL SQLSTATEs:
  - `23505` unique violation from concurrent catalog insert races,
  - `42P07` duplicate table,
  - `42710` duplicate object.
- Non-schema errors are still returned immediately.
- Retry uses short bounded backoff and respects context cancellation.

## Evidence

Failed high-fanout probe:

`reports/identity-http-benchmark.concurrency4400-multi8-ingress22-pool8-client200-unlogged-session-table-ingress19080-worker-pool-ab.json`

- Status: `FAILED`
- Profile: `8 workers * 8 DB connections = 64`
- Failure phase: `passwordLogin`
- Failure reason: ingress upstream socket exhaustion on Windows local transport.

Passed lower-fanout probe:

`reports/identity-http-benchmark.concurrency4400-multi8-ingress22-pool8-client200-unlogged-session-table-ingress30-warm12-worker-pool-ab.json`

- Status: `PASSED`
- Profile: `8 workers * 8 DB connections = 64`
- Total duration: `180714.68ms`
- Revoke-cycle P99: `2724.31ms`
- Revoke-cycle step P99:
  - login: `1005.99ms`
  - revoke: `1085.55ms`
  - revoked principal lookup: `1013.82ms`

Passed ten-worker smaller-pool probe:

`reports/identity-http-benchmark.concurrency4400-multi10-ingress22-pool6-client200-unlogged-session-table-ingress24-warm8-worker-pool-ab.json`

- Status: `PASSED`
- Profile: `10 workers * 6 DB connections = 60`
- Total duration: `189631.48ms`
- Revoke-cycle P99: `2860.87ms`
- Password-login P99: `2089.19ms`

Current six-worker source evidence for comparison:

`reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool12-client200-unlogged-session-table-ingress19080-clean-table-docker-bench.json`

- Status: `PASSED`
- Profile: `6 workers * 12 DB connections = 72`
- Revoke-cycle P99: `2893.02ms`

## Interpretation

The eight-worker smaller-pool profile improves the slowest revoke-cycle P99 by
`168.71ms` and reduces Identity DB pool demand by eight connections, but it
also increases total benchmark duration versus the six-worker unlogged source
evidence and still does not meet the root interactive P99 target. The
ten-worker profile reduces DB pool demand further, but regresses both total
duration and login tail latency.

This is useful directionally, not promotion evidence. The next Identity
optimization should reduce synchronous revoke-cycle pressure or change the
benchmark/runtime topology so local socket fanout no longer dominates the
measurement.

## Acceptance Criteria

- Focused tests fail before the schema retry implementation.
- Focused tests pass after the schema retry implementation.
- Non-schema PostgreSQL errors are not swallowed by the retry helper.
- The eight-worker cold-start probe no longer fails on concurrent schema DDL.
- Failed ingress/socket evidence is preserved rather than overwritten.
- Root SLO promotion remains blocked until latency and sustained scale gates
  pass.

## Rollback

Remove the schema retry helper and focused tests. Keep the eight-worker probe
reports as negative evidence that cold-start and socket-fanout topology were
not safe before this slice.
