# P34 Conversation Write Warm Retry Profile Evidence

## Scope

This slice follows SDD 0117. The goal was to explain and reduce the Research
conversation write tail-latency jump above the direct eight-gateway 2600
profile without changing root requirements or adding AI/model/training
dependencies.

## Diagnosis

PostgreSQL/PgBouncer diagnostics were added to the conversation write runner and
shared with the existing Identity diagnostics path through module-neutral tools.

The diagnostic run at 2750/warm200 passed functionally but raised measured
latency because the diagnostics run Docker `psql` probes during a very short
benchmark:

- `reports/conversation-write-http-benchmark.direct8-concurrency2750-multi8-warm200-postgres-diagnostics.json`
- 2750 concurrency, 5500 operations, 0 errors.
- P95 820.03ms, used as diagnostic evidence only.
- PostgreSQL wait timeline showed `ClientRead` and no sampled `WalWrite`,
  `WalSync`, or lock wait.
- PgBouncer pools showed `cl_waiting=0`.

The more actionable bottleneck was reproduced by a no-diagnostics 2750/warm200
repeat: it failed with connection refusals while all eight gateway processes
stayed alive. The bottleneck was therefore local listener/cold-connection
pressure at the benchmark boundary, not a PostgreSQL write failure.

Warm-up itself also hit the same local listener edge:

- `reports/conversation-write-http-benchmark.direct8-concurrency2800-multi8-warm350.json`
  failed during warm-up before measured writes.
- `reports/conversation-write-http-benchmark.direct8-concurrency2800-multi8-warm344.json`
  also failed during warm-up before measured writes.
- After adding bounded warm-up retries, the same 2800/warm350 shape passed.

## Change

- Added `tools/postgres-diagnostics.mjs` and `tools/pgbouncer-diagnostics.mjs`.
- Kept Identity diagnostic modules as compatibility facades.
- Added optional conversation PostgreSQL/PgBouncer diagnostics.
- Added `--warm-connection-retries` to the Go HTTP benchmark and Node runner.
- Recorded `warmConnectionRetries` in benchmark transport metadata.

## Performance Evidence

New current low-latency profile:

- `reports/conversation-write-http-benchmark.current.json`
- 2800 concurrency / 5600 operations / 8 gateways / DB pool 8 per worker.
- `max-conns-per-host=350`, `warm-connections-per-host=350`,
  `warm-connection-retries=3`.
- PASSED, 6282.99 RPS, P95 453.72ms, P99 496.33ms, 0 errors.

Boundary and negative/conditional probes:

- `reports/conversation-write-http-benchmark.direct8-concurrency2750-multi8-warm344.json`:
  PASSED, 6222.43 RPS, P95 471.19ms, 0 errors.
- `reports/conversation-write-http-benchmark.direct8-concurrency2850-multi8-warm357-retry.json`:
  PASSED, but P95 539.62ms; not promoted.
- `reports/conversation-write-http-benchmark.direct8-concurrency2900-multi8-warm363-retry.json`:
  PASSED, but P95 502.50ms; close to the target but still above it.
- `reports/conversation-write-http-benchmark.direct8-concurrency3000-multi8-warm375-retry.json`:
  PASSED, but P95 511.33ms under pool8; not promoted.
- `reports/conversation-write-http-benchmark.direct8-concurrency3000-multi8-pool6-warm375-retry.json`:
  PASSED, but P95 599.42ms; DB pool 6 is too restrictive for this profile.
- `reports/conversation-write-http-benchmark.direct8-concurrency3000-multi8-pool10-warm375-retry.json`:
  PASSED once at P95 466.49ms, but not promoted without repeat stability.
- `reports/conversation-write-http-benchmark.direct8-concurrency3000-multi8-pool10-warm375-retry-repeat.json`:
  PASSED, P95 530.61ms; 3000 remains a capacity probe.
- `reports/conversation-write-http-benchmark.direct8-concurrency3200-multi8-pool10-warm400-retry.json`:
  PASSED, P95 549.15ms; 3200 is zero-error capacity evidence only.

## Current Assessment

The Research conversation write current claim moves from direct eight-gateway
2600 to direct eight-gateway 2800. This is a configuration-level improvement:
the application code path and PostgreSQL durability remain unchanged.

The current practical boundary is:

- Low-latency current: 2800 concurrent writes, P95 below 500ms.
- Zero-error capacity: at least 3200 concurrent writes, but P95 above 500ms.
- Primary remaining bottleneck: local listener/connection shaping plus high-load
  tail-latency variance, not basic PostgreSQL capacity.

## Verification

- `go test ./services/conversation-write-gateway/cmd/httpbench -count=1`: PASS.
- `node --test tools/run-conversation-write-benchmark.test.mjs`: PASS.
- `node --test tools/identity-postgres-diagnostics.test.mjs tools/run-identity-http-benchmark.test.mjs`: PASS.
- `npm run verify:structure`: PASS.
- `npm run audit:performance-evidence`: PASS, 45 evidence entries.
- `npm run budget:connections:pgbouncer`: PASS, planned 144 / safe 190.
- `npm run quality`: PASS, 120 Node tool tests plus Go/Rust gates and audits.

Post-run cleanup:

- Residual `bench conversation %` rows: 0.
- No conversation gateway or ingress benchmark processes were left running.
- Sensitive scan over conversation benchmark JSON reports found no raw
  `postgres://`, `postgresql://`, or `ueacd` values.
