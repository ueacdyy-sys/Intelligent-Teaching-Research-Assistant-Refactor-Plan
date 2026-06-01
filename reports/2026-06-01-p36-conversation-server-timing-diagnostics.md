# P36 Conversation Server Timing Diagnostics

## Scope

This slice follows SDD 0119. It adds a lightweight `Server-Timing` diagnostic to
the Research conversation write path and teaches the Go HTTP benchmark to
record service-side timing beside end-to-end client latency.

The slice is diagnostic only. It does not change the OpenAPI body contract,
database schema, durability, PgBouncer profile, root requirements, or baseline
runtime dependencies.

## Change

- The conversation write gateway now emits
  `Server-Timing: app;dur=<milliseconds>` after the create-conversation use case
  completes.
- The benchmark parses the `Server-Timing` header and includes
  `serverTimingMs` plus `serverTimingSamples` when samples are present.
- Existing benchmark reports remain backward compatible because
  `serverTimingMs` is omitted when no timing header exists.

## Performance Evidence

New current low-latency profile:

- `reports/conversation-write-http-benchmark.current.json`
- copied from
  `reports/conversation-write-http-benchmark.direct8-concurrency3000-multi8-warm375-server-timing-repeat.json`
  to preserve the promoted run as a standalone current artifact.
- direct 8 gateways, 3000 concurrency, 6000 operations.
- DB pool 8 per worker, total 64.
- `max-conns-per-host=375`, `warm-connections-per-host=375`,
  `warm-connection-retries=3`.
- PASSED, 6717.05 RPS, client P95 493.11ms, client P99 544.07ms, 0 errors.
- Server timing: P95 376.46ms, P99 380.54ms, 6000 samples.
- P99 client minus server gap: 163.53ms.

Supporting and boundary probes:

- `reports/conversation-write-http-benchmark.direct8-concurrency3000-multi8-warm375-server-timing.json`:
  PASSED, but used only as cold/local-variance evidence: 4233.29 RPS, client
  P95 895.97ms, client P99 939.55ms, server P95 766.39ms, server P99
  793.01ms, 0 errors.
- `reports/conversation-write-http-benchmark.direct8-concurrency3100-multi8-warm388-server-timing.json`:
  PASSED once at 7073.80 RPS, client P95 467.39ms, client P99 517.93ms,
  server P95 407.91ms, server P99 411.45ms, 0 errors.
- `reports/conversation-write-http-benchmark.direct8-concurrency3100-multi8-warm388-server-timing-repeat.json`:
  PASSED, but not promoted: 6489.68 RPS, client P95 518.09ms, client P99
  556.23ms, server P95 446.48ms, server P99 451.57ms, 0 errors.

## Current Assessment

The current Research conversation write claim remains direct eight-gateway 3000
concurrent writes. This run is still under the SDD 0001 P95 target and has zero
write errors, but P99 remains above 500ms.

The new timing split narrows the next bottleneck:

- At the promoted 3000 profile, server-side P99 is 380.54ms while end-to-end
  P99 is 544.07ms.
- The 163.53ms P99 gap is outside the measured server application create path.
- At the 3100 repeat boundary, both server timing and end-to-end timing rise;
  client P95 crosses 500ms, so 3100 remains an unstable boundary rather than a
  current claim.

Next optimization should split the remaining tail across transport/listener
scheduling, client runtime pressure, and database pool wait instrumentation
before increasing gateway count, DB pool size, or concurrency targets again.

## Verification

- `go test ./services/conversation-write-gateway/... -count=1`: PASS.
- `npm run audit:performance-evidence`: required before merge-ready status.
- `npm run quality`: required before merge-ready status.

Post-run cleanup:

- Residual `bench conversation %` rows: 0 before registry/report update.
- No conversation gateway, ingress proxy, or httpbench processes were observed
  after the benchmark runs.
