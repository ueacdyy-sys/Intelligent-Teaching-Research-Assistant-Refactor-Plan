# P35 Conversation Settings JSON Hot Path

## Scope

This slice follows SDD 0118. It optimizes the Research conversation write hot
path without changing the OpenAPI contract, database schema, root requirements,
or baseline runtime dependencies.

## Change

Before this slice, `settings` crossed the hot path as:

1. HTTP boundary decodes JSON into `map[string]any`.
2. Use case stores the map in `domain.Conversation`.
3. PostgreSQL adapter marshals the map back to JSON for `$7::jsonb`.

After this slice:

1. HTTP boundary validates that `settings` is a JSON object or `null`.
2. Domain stores validated raw JSON bytes.
3. PostgreSQL adapter passes the raw JSON string directly to `$7::jsonb`.

This removes duplicate map decode/remarshal work from every create-conversation
request while preserving object/null validation.

## Performance Evidence

Baseline current before this slice:

- `reports/conversation-write-http-benchmark.current.json`
- direct 8 gateways, 2800 concurrency, 5600 operations.
- 6282.99 RPS, P95 453.72ms, P99 496.33ms, 0 errors.

Warm-repeat evidence after this slice:

- `reports/conversation-write-http-benchmark.direct8-concurrency2800-multi8-warm350-raw-settings-repeat.json`
- direct 8 gateways, 2800 concurrency, 5600 operations.
- 6740.61 RPS, P95 449.75ms, P99 495.92ms, 0 errors.

New current low-latency profile:

- `reports/conversation-write-http-benchmark.current.json`
- copied from
  `reports/conversation-write-http-benchmark.direct8-concurrency3000-multi8-warm375-raw-settings-repeat.json`
  to preserve the promoted run as a standalone artifact.
- direct 8 gateways, 3000 concurrency, 6000 operations.
- DB pool 8 per worker, total 64.
- `max-conns-per-host=375`, `warm-connections-per-host=375`,
  `warm-connection-retries=3`.
- PASSED, 6463.07 RPS, P95 485.30ms, P99 569.78ms, 0 errors.

Supporting probes:

- `reports/conversation-write-http-benchmark.direct8-concurrency2900-multi8-warm363-raw-settings.json`:
  PASSED, 6444.11 RPS, P95 476.46ms, P99 521.36ms, 0 errors.
- `reports/conversation-write-http-benchmark.direct8-concurrency2900-multi8-warm363-raw-settings-repeat.json`:
  PASSED, 6858.81 RPS, P95 452.11ms, P99 496.97ms, 0 errors.
- `reports/conversation-write-http-benchmark.direct8-concurrency3000-multi8-warm375-raw-settings.json`:
  PASSED, 6574.43 RPS, P95 490.93ms, P99 543.99ms, 0 errors.
- `reports/conversation-write-http-benchmark.direct8-concurrency3100-multi8-warm388-raw-settings.json`:
  PASSED, 6866.22 RPS, P95 504.66ms, P99 550.10ms, 0 errors.

The first raw-settings 2800 run after Docker startup was intentionally not used
for promotion because it was a cold local run:

- `reports/conversation-write-http-benchmark.direct8-concurrency2800-multi8-warm350-raw-settings.json`
- PASSED, but P95 770.91ms.

## Current Assessment

The current Research conversation write claim moves from direct eight-gateway
2800 to direct eight-gateway 3000 under the same DB pool budget.

The practical boundary is now:

- Low-latency current: 3000 concurrent writes, P95 below 500ms, 0 errors.
- Nearest above-target probe: 3100 concurrent writes, 0 errors, but P95
  504.66ms.
- Remaining bottleneck: high-load tail-latency variance, especially P99,
  rather than JSON decode overhead alone.

## Verification

- `go test ./services/conversation-write-gateway/... -count=1`: PASS.
- `npm run verify:structure`: PASS.
- Performance registry was updated to point at the new 3000 current report and
  3100 latency-boundary probe.

Post-run cleanup:

- Residual `bench conversation %` rows: 0.
- No conversation gateway, ingress proxy, or httpbench processes were left
  running after the benchmark runs.
