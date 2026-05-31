# P33 Conversation Write Direct Worker Profile Evidence

## Scope

This slice follows SDD 0115 by testing whether direct gateway worker scaling can
raise the Research conversation write low-latency point without adding ingress
proxy hops.

It also changes the benchmark warm-up strategy. Instead of opening warm
connections to every gateway host at the same instant, the benchmark now warms
one host at a time while still opening the requested number of connections in
parallel for that host.

## Red To Green Evidence

Focused Go test added for warm-up behavior:

```text
go test ./services/conversation-write-gateway/cmd/httpbench -count=1
PASS
```

The test proves that warm-up reaches the requested connection count for the
first host before the second host starts, preventing all-host connection storms.

Focused runner metadata test:

```text
node --test tools/run-conversation-write-benchmark.test.mjs
PASS
```

## Runtime Profile

- Runner: `npm run bench:conversation-write:pgbouncer`
- PostgreSQL container: `ita-identity-session-postgres`
- PgBouncer container: `ita-identity-session-pgbouncer`
- Gateway DB pool: `DB_MAX_CONNS=8`
- Direct eight-gateway total DB pool budget: 64
- PostgreSQL max connections: 300
- PgBouncer max DB connections: 90
- PgBouncer connection-budget plan after this slice: 144 planned,
  190 safe limit, 280 hard limit
- Local secrets: `ueacd`

## Direct Worker Scale Curve

Previous low-latency baseline:

- 2100 concurrency / 6 gateways: PASSED, 5351.62 RPS, P95 404.20ms, 0 errors.

New direct worker profile:

- 2600 concurrency / 8 gateways / warm200: PASSED, 6567.01 RPS,
  P95 456.37ms, 0 errors.
- 2750 concurrency / 8 gateways / warm200: PASSED, 5950.99 RPS,
  P95 533.20ms, 0 errors.
- 2800 concurrency / 8 gateways / warm250: PASSED, 5926.85 RPS,
  P95 536.07ms, 0 errors.

## Current Assessment

The current Research conversation write claim moves from the direct six-gateway
2100 point to the direct eight-gateway 2600 point. This improves both
concurrency and throughput while staying under the 500ms P95 target.

The best current interpretation is:

- Direct eight-gateway profile: best low-latency evidence, 2600 concurrency,
  6567.01 RPS, P95 456.37ms.
- Direct eight-gateway 2750 and 2800: zero-error capacity probes, but P95 is
  above the target.
- Ingress 2800 remains useful capacity evidence, but direct eight-gateway 2600
  is the better production-default candidate for low-latency writes.

The next bottleneck is no longer basic PostgreSQL capacity. It is the
2750-to-2800 direct write tail-latency jump under high local connection
pressure.

## Evidence Files

- `services/conversation-write-gateway/cmd/httpbench/main.go`
- `services/conversation-write-gateway/cmd/httpbench/main_test.go`
- `tools/run-conversation-write-benchmark.mjs`
- `tools/run-conversation-write-benchmark.test.mjs`
- `reports/conversation-write-http-benchmark.current.json`
- `reports/conversation-write-http-benchmark.direct8-concurrency2750-multi8-warm200.json`
- `reports/conversation-write-http-benchmark.direct8-concurrency2800-multi8-warm250-repeat.json`

## Final Gates

- `go test ./services/conversation-write-gateway/cmd/httpbench -count=1`: PASS.
- `node --test tools/run-conversation-write-benchmark.test.mjs`: PASS.
- `npm run audit:performance-evidence`: PASS, 45 evidence entries.
- `npm run budget:connections:pgbouncer`: PASS, planned 144 / safe 190.
- `npm run quality`: PASS, strict pre-merge gate.
